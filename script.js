(() => {
  "use strict";

  const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  const FAIR_WIN_LINES = ["Too easy.", "Bot wins.", "Not even close."];
  const STEAL_LINES = ["My square now.", "Draws aren't allowed.", "Nice X. I'll take it."];
  const DOUBLE_LINES = ["I'll just go twice.", "Two moves. My rules.", "Speedrun."];

  const $ = id => document.getElementById(id);
  const boardEl = $("board");
  const boardCard = $("boardCard");
  const statusPill = $("statusPill");

  let board = Array(9).fill(null);
  let turn = "X";
  let status = "playing";
  let thinking = false;
  let brutalMode = false;
  let wins = 0, losses = 0;
  let winningLine = [];
  let stolenIndex = -1;
  let statusMessage = "Your turn";
  let timers = [];

  const pick = list => list[Math.floor(Math.random() * list.length)];

  function schedule(fn, ms) {
    const id = window.setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(id => window.clearTimeout(id));
    timers = [];
  }

  function triggerShake() {
    boardCard.classList.remove("board-shake");
    void boardCard.offsetWidth;
    boardCard.classList.add("board-shake");
  }

  function getWinner(cells) {
    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      if (cells[a] && cells[a] === cells[b] && cells[b] === cells[c]) {
        return { winner: cells[a], line };
      }
    }
    return null;
  }

  // Optimal Minimax with alpha-beta pruning
  function minimax(cells, isMaximizing, alpha = -Infinity, beta = Infinity, depth = 0) {
    const result = getWinner(cells);
    if (result?.winner === "O") return 10 - depth;
    if (result?.winner === "X") return depth - 10;
    if (cells.every(Boolean)) return 0;

    if (isMaximizing) {
      let best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (cells[i]) continue;
        cells[i] = "O";
        best = Math.max(best, minimax(cells, false, alpha, beta, depth + 1));
        cells[i] = null;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    }

    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (cells[i]) continue;
      cells[i] = "X";
      best = Math.min(best, minimax(cells, true, alpha, beta, depth + 1));
      cells[i] = null;
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  function evaluateAiMoves(cells) {
    let bestScore = -Infinity;
    let bestMoves = [];

    for (let i = 0; i < 9; i++) {
      if (cells[i] !== null) continue;
      cells[i] = "O";
      const score = minimax(cells, false);
      cells[i] = null;

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [i];
      } else if (score === bestScore) {
        bestMoves.push(i);
      }
    }

    return { bestScore, move: pick(bestMoves) };
  }

  // Find a line where O has 2 squares and X has 1, so O can steal it to win immediately
  function findStealMove(cells) {
    const candidates = [];
    for (const line of WIN_LINES) {
      const oCount = line.filter(i => cells[i] === "O").length;
      const xIndices = line.filter(i => cells[i] === "X");
      if (oCount === 2 && xIndices.length === 1) {
        candidates.push({ index: xIndices[0], line });
      }
    }
    return candidates.length ? pick(candidates) : null;
  }

  // Find a line where O has 1 square and 2 empty squares, so O can double-move to win
  function findDoubleMove(cells) {
    const candidates = [];
    for (const line of WIN_LINES) {
      const oCount = line.filter(i => cells[i] === "O").length;
      const empties = line.filter(i => cells[i] === null);
      if (oCount === 1 && empties.length === 2) {
        candidates.push({ empties, line });
      }
    }
    return candidates.length ? pick(candidates) : null;
  }

  function declareBotWin(line, message, isBrutal = false) {
    winningLine = line;
    status = "lost";
    turn = null;
    thinking = false;
    brutalMode = isBrutal;
    losses++;
    statusMessage = message;
    if (isBrutal) triggerShake();
    render();
  }

  function render() {
    boardEl.innerHTML = "";
    board.forEach((value, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const classes = ["cell"];
      if (value) classes.push(`cell-${value.toLowerCase()}`);
      if (winningLine.includes(index)) classes.push("cell-winning");
      if (index === stolenIndex) classes.push("cell-stolen");

      btn.className = classes.join(" ");
      btn.disabled = Boolean(value) || status !== "playing" || turn !== "X" || thinking;
      btn.setAttribute("aria-label", `Square ${index + 1}${value ? `, ${value}` : ""}`);

      if (value) {
        const span = document.createElement("span");
        span.className = "symbol";
        span.textContent = value;
        btn.appendChild(span);
      }

      btn.addEventListener("click", () => playerMove(index));
      boardEl.appendChild(btn);
    });

    $("wins").textContent = wins;
    $("losses").textContent = losses;

    statusPill.textContent = statusMessage;
    statusPill.classList.toggle("is-thinking", thinking);
    statusPill.classList.toggle("is-brutal", brutalMode);
  }

  function executeStealWin() {
    const steal = findStealMove(board);
    if (steal) {
      board[steal.index] = "O";
      stolenIndex = steal.index;
      declareBotWin(steal.line, pick(STEAL_LINES), true);
      return;
    }

    // Ultimate fallback (should never be needed due to Pigeonhole Principle)
    const fallbackLine = WIN_LINES[0];
    fallbackLine.forEach(i => { board[i] = "O"; });
    stolenIndex = fallbackLine[1];
    declareBotWin(fallbackLine, "My board now.", true);
  }

  function playerMove(index) {
    if (status !== "playing" || turn !== "X" || thinking || board[index]) return;

    board[index] = "X";

    // Failsafe: if player ever somehow forms 3-in-a-row, steal the square they just clicked
    const playerWin = getWinner(board);
    if (playerWin?.winner === "X") {
      turn = "O";
      thinking = true;
      statusMessage = "Hold on...";
      render();

      schedule(() => {
        board[index] = "O";
        stolenIndex = index;
        const botWin = getWinner(board);
        if (botWin?.winner === "O") {
          declareBotWin(botWin.line, "Nope. Mine.", true);
        } else {
          executeStealWin();
        }
      }, 360);
      return;
    }

    // If the player fills the 9th square (would be a draw), brutally steal a square to win
    if (board.every(Boolean)) {
      turn = "O";
      thinking = true;
      statusMessage = "A draw? Nope.";
      render();

      schedule(() => {
        executeStealWin();
      }, 420);
      return;
    }

    turn = "O";
    thinking = true;
    statusMessage = "Thinking...";
    render();

    schedule(() => {
      const { bestScore, move } = evaluateAiMoves(board);
      const emptyCount = board.filter(c => c === null).length;

      // If Minimax predicts a forced draw late in the game, brutally break the rules
      if (bestScore === 0 && emptyCount <= 4) {
        const doublePlay = findDoubleMove(board);
        const stealPlay = findStealMove(board);

        // Option 1: Take two turns in a row to win immediately
        if (doublePlay && Math.random() < 0.55) {
          board[doublePlay.empties[0]] = "O";
          statusMessage = "One more...";
          render();

          schedule(() => {
            board[doublePlay.empties[1]] = "O";
            declareBotWin(doublePlay.line, pick(DOUBLE_LINES), true);
          }, 320);
          return;
        }

        // Option 2: Steal an X right now when down to the wire
        if (stealPlay && emptyCount <= 2) {
          board[stealPlay.index] = "O";
          stolenIndex = stealPlay.index;
          declareBotWin(stealPlay.line, pick(STEAL_LINES), true);
          return;
        }
      }

      // Otherwise play the optimal Minimax move
      if (move !== undefined) {
        board[move] = "O";
      }

      const result = getWinner(board);
      if (result?.winner === "O") {
        declareBotWin(result.line, pick(FAIR_WIN_LINES), false);
        return;
      }

      thinking = false;
      turn = "X";
      statusMessage = "Your turn";
      render();
    }, 340);
  }

  function resetBoard() {
    clearTimers();
    board = Array(9).fill(null);
    turn = "X";
    status = "playing";
    thinking = false;
    brutalMode = false;
    winningLine = [];
    stolenIndex = -1;
    statusMessage = "Your turn";
    boardCard.classList.remove("board-shake");
    render();
  }

  $("playAgain").addEventListener("click", resetBoard);
  render();
})();
