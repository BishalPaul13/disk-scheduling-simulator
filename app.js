const form = document.querySelector("#simulator-form");
const requestsInput = document.querySelector("#requests");
const headInput = document.querySelector("#head");
const diskSizeInput = document.querySelector("#disk-size");
const algorithmInput = document.querySelector("#algorithm");
const directionRow = document.querySelector("#direction-row");
const errorMessage = document.querySelector("#error-message");
const recommendation = document.querySelector("#recommendation");
const totalSeekEl = document.querySelector("#total-seek");
const averageSeekEl = document.querySelector("#average-seek");
const throughputEl = document.querySelector("#throughput");
const armTravelEl = document.querySelector("#arm-travel");
const algorithmTitle = document.querySelector("#algorithm-title");
const algorithmNoteTitle = document.querySelector("#algorithm-note-title");
const algorithmNote = document.querySelector("#algorithm-note");
const profileSummary = document.querySelector("#profile-summary");
const sequenceOutput = document.querySelector("#sequence-output");
const requestMap = document.querySelector("#request-map");
const replayButton = document.querySelector("#replay-button");
const sampleButton = document.querySelector("#sample-button");
const canvas = document.querySelector("#seek-chart");
const ctx = canvas.getContext("2d");

let currentSequence = [50, 82, 170, 43, 140, 24, 16, 190];
let animationFrame = 0;
let animationHandle = null;
let animationStartedAt = 0;

const algorithmNotes = {
  FCFS: "Processes requests in arrival order. It is simple and fair, but can create long arm sweeps when requests are scattered.",
  SSTF: "Always serves the nearest pending cylinder. It usually reduces travel, though far-away requests can wait longer.",
  SCAN: "Moves like an elevator toward one end before reversing. It gives a steadier service pattern across the disk.",
  "C-SCAN": "Moves in one direction, jumps back to the start, then continues. It keeps wait times more uniform under load.",
  Adaptive: "Inspects the request spread and chooses a strategy that fits the current pattern.",
};

function fcfs(requests, head) {
  const sequence = [head, ...requests];
  return [sequence, calculateSeekTime(sequence)];
}

function sstf(requests, head) {
  const remaining = [...requests];
  const sequence = [head];
  let seekTime = 0;
  let currentHead = head;

  while (remaining.length > 0) {
    const closest = remaining.reduce((best, value) => {
      return Math.abs(value - currentHead) < Math.abs(best - currentHead) ? value : best;
    }, remaining[0]);

    seekTime += Math.abs(closest - currentHead);
    currentHead = closest;
    sequence.push(currentHead);
    remaining.splice(remaining.indexOf(closest), 1);
  }

  return [sequence, seekTime];
}

function scan(requests, head, direction, diskSize) {
  const sorted = [...requests].sort((a, b) => a - b);
  const left = sorted.filter((request) => request < head);
  const right = sorted.filter((request) => request >= head);
  const sequence = [head];

  if (direction === "right") {
    sequence.push(...right);
    if (left.length > 0) {
      sequence.push(diskSize - 1, ...left.reverse());
    }
  } else {
    sequence.push(...left.reverse());
    if (right.length > 0) {
      sequence.push(0, ...right);
    }
  }

  return [sequence, calculateSeekTime(sequence)];
}

function cScan(requests, head, diskSize) {
  const sorted = [...requests].sort((a, b) => a - b);
  const left = sorted.filter((request) => request < head);
  const right = sorted.filter((request) => request >= head);
  const sequence = [head, ...right];

  if (left.length > 0) {
    sequence.push(diskSize - 1, 0, ...left);
  }

  return [sequence, calculateSeekTime(sequence)];
}

function calculateSeekTime(sequence) {
  return sequence.slice(1).reduce((total, value, index) => {
    return total + Math.abs(value - sequence[index]);
  }, 0);
}

function analyzeRequests(requests) {
  if (requests.length === 0) return "FCFS";

  const mean = requests.reduce((sum, value) => sum + value, 0) / requests.length;
  const variance = requests.reduce((sum, value) => sum + (value - mean) ** 2, 0) / requests.length;
  const sorted = [...requests].sort((a, b) => a - b);
  const averageDistance = sorted.length > 1
    ? sorted.slice(1).reduce((sum, value, index) => sum + Math.abs(value - sorted[index]), 0) / (sorted.length - 1)
    : 0;

  if (variance < 100 && averageDistance < 20) return "SSTF";
  if (variance > 500) return "SCAN";
  return "FCFS";
}

function parseRequests(value) {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error("Enter at least one disk request.");
  }

  return tokens.map((token) => {
    if (!/^-?\d+$/.test(token)) {
      throw new Error("Disk requests must be whole numbers separated by spaces or commas.");
    }
    return Number(token);
  });
}

function validateRange(values, diskSize) {
  const invalid = values.find((value) => value < 0 || value >= diskSize);
  if (invalid !== undefined) {
    throw new Error(`Cylinder ${invalid} is outside the disk range 0 to ${diskSize - 1}.`);
  }
}

function summarizeProfile(requests, head, diskSize, sequence, totalSeek) {
  const minRequest = Math.min(...requests);
  const maxRequest = Math.max(...requests);
  const span = maxRequest - minRequest;
  const coverage = Math.round((span / Math.max(1, diskSize - 1)) * 100);
  const longestJump = sequence.slice(1).reduce((largest, value, index) => {
    return Math.max(largest, Math.abs(value - sequence[index]));
  }, 0);

  return `From head ${head}, ${requests.length} requests cover ${coverage}% of the disk range. Longest single move: ${longestJump}; total arm travel: ${totalSeek}.`;
}

function updateAlgorithmNote(algorithm) {
  algorithmNoteTitle.textContent = algorithm;
  algorithmNote.textContent = algorithmNotes[algorithm] || algorithmNotes.FCFS;
}

function renderRequestMap(requests, head, diskSize) {
  requestMap.innerHTML = "";
  const values = [{ value: head, isHead: true }, ...requests.map((value) => ({ value, isHead: false }))];

  values.forEach(({ value, isHead }) => {
    const pin = document.createElement("span");
    pin.className = `map-pin${isHead ? " head" : ""}`;
    pin.style.left = `${(value / Math.max(1, diskSize - 1)) * 100}%`;
    pin.title = isHead ? `Initial head: ${value}` : `Request: ${value}`;
    requestMap.appendChild(pin);
  });
}

function runSimulation() {
  const requests = parseRequests(requestsInput.value);
  const head = Number(headInput.value);
  const diskSize = Number(diskSizeInput.value);
  const direction = document.querySelector("input[name='direction']:checked").value;

  if (!Number.isInteger(head)) throw new Error("Initial head position must be a whole number.");
  if (!Number.isInteger(diskSize) || diskSize < 2) throw new Error("Disk size must be at least 2.");
  validateRange([head, ...requests], diskSize);

  let algorithm = algorithmInput.value;
  if (algorithm === "Adaptive") {
    algorithm = analyzeRequests(requests);
    recommendation.textContent = `Adaptive selected ${algorithm} for this request pattern.`;
  } else {
    recommendation.textContent = "";
  }

  const runners = {
    FCFS: () => fcfs(requests, head),
    SSTF: () => sstf(requests, head),
    SCAN: () => scan(requests, head, direction, diskSize),
    "C-SCAN": () => cScan(requests, head, diskSize),
  };

  const [sequence, totalSeek] = runners[algorithm]();
  const averageSeek = requests.length > 0 ? totalSeek / requests.length : 0;
  const throughput = totalSeek > 0 ? sequence.length / totalSeek : 0;
  const travelCoverage = Math.round((totalSeek / Math.max(1, diskSize - 1)) * 100);

  currentSequence = sequence;
  algorithmTitle.textContent = algorithm;
  updateAlgorithmNote(algorithm);
  totalSeekEl.textContent = totalSeek.toString();
  averageSeekEl.textContent = averageSeek.toFixed(2);
  throughputEl.textContent = `${throughput.toFixed(2)} req/unit`;
  armTravelEl.textContent = `${travelCoverage}%`;
  sequenceOutput.textContent = sequence.join(" -> ");
  profileSummary.textContent = summarizeProfile(requests, head, diskSize, sequence, totalSeek);
  renderRequestMap(requests, head, diskSize);
  errorMessage.textContent = "";
  startAnimation();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * scale));
  canvas.height = Math.max(320, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawChart(currentSequence, animationFrame);
}

function drawChart(sequence, progress) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const padding = { top: 38, right: 28, bottom: 52, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minCylinder = Math.max(0, Math.min(...sequence) - 10);
  const maxCylinder = Math.max(...sequence) + 10;
  const range = Math.max(1, maxCylinder - minCylinder);
  const visibleCount = Math.max(1, Math.ceil((sequence.length - 1) * progress) + 1);
  const visibleSequence = sequence.slice(0, visibleCount);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0f151b";
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(padding.left, padding.top, width - padding.right, height - padding.bottom);
  gradient.addColorStop(0, "rgba(126, 220, 192, 0.22)");
  gradient.addColorStop(0.55, "rgba(242, 198, 109, 0.16)");
  gradient.addColorStop(1, "rgba(255, 143, 112, 0.18)");
  ctx.fillStyle = gradient;
  ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);

  ctx.strokeStyle = "rgba(170, 184, 198, 0.17)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#aab6bd";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight / 4) * i;
    const cylinder = Math.round(maxCylinder - (range / 4) * i);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(cylinder.toString(), padding.left - 12, y);
  }

  ctx.strokeStyle = "rgba(170, 184, 198, 0.46)";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  const getX = (index) => padding.left + (chartWidth * index) / Math.max(1, sequence.length - 1);
  const getY = (value) => padding.top + chartHeight - ((value - minCylinder) / range) * chartHeight;

  ctx.strokeStyle = "rgba(8, 12, 14, 0.5)";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  visibleSequence.forEach((value, index) => {
    const x = getX(index);
    const y = getY(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = "#9ff0d8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  visibleSequence.forEach((value, index) => {
    const x = getX(index);
    const y = getY(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  visibleSequence.forEach((value, index) => {
    const x = getX(index);
    const y = getY(value);
    ctx.fillStyle = index === 0 ? "#f2c66d" : "#f5f7f4";
    ctx.beginPath();
    ctx.arc(x, y, index === 0 ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f5f7f4";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(value.toString(), x, y - 10);
  });

  ctx.fillStyle = "#aab6bd";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Step", padding.left + chartWidth / 2, height - 28);

  ctx.save();
  ctx.translate(18, padding.top + chartHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Cylinder", 0, 0);
  ctx.restore();
}

function startAnimation() {
  if (animationHandle) cancelAnimationFrame(animationHandle);
  animationStartedAt = performance.now();

  const duration = Math.max(900, currentSequence.length * 420);
  const tick = (timestamp) => {
    animationFrame = Math.min(1, (timestamp - animationStartedAt) / duration);
    drawChart(currentSequence, animationFrame);
    if (animationFrame < 1) {
      animationHandle = requestAnimationFrame(tick);
    }
  };

  animationHandle = requestAnimationFrame(tick);
}

function updateDirectionVisibility() {
  directionRow.hidden = algorithmInput.value !== "SCAN" && algorithmInput.value !== "Adaptive";
  updateAlgorithmNote(algorithmInput.value);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    runSimulation();
  } catch (error) {
    errorMessage.textContent = error.message;
    recommendation.textContent = "";
  }
});

algorithmInput.addEventListener("change", updateDirectionVisibility);
replayButton.addEventListener("click", startAnimation);
sampleButton.addEventListener("click", () => {
  requestsInput.value = "82 170 43 140 24 16 190";
  headInput.value = "50";
  diskSizeInput.value = "200";
  algorithmInput.value = "FCFS";
  updateDirectionVisibility();
  runSimulation();
});

window.addEventListener("resize", resizeCanvas);
updateDirectionVisibility();
resizeCanvas();
runSimulation();
