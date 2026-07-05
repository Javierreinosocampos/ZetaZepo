// ==================================================================
// CONFIGURACIÓN GENERAL
// ==================================================================
const CONFIG = {
    API_BASE_URL: '', // ej: 'https://mi-backend.onrender.com'
    LOCAL_STORAGE_BEST_KEY: 'atrapaFruta_bestScore',
    LOCAL_STORAGE_SCORES_KEY: 'atrapaFruta_scores', // tabla de récords local
    LOCAL_STORAGE_NAME_KEY: 'atrapaFruta_playerName'
};

// ==================================================================
// ELEMENTOS DEL DOM
// ==================================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const livesEl = document.getElementById('lives');

const splashScreen = document.getElementById('splash-screen');
const splashImage = document.getElementById('splash-image');
const splashFallback = document.getElementById('splash-fallback');

const loadingScreen = document.getElementById('loading-screen');

const menuScreen = document.getElementById('menu-screen');
const playerNameInput = document.getElementById('player-name');
const nameError = document.getElementById('name-error');
const playBtn = document.getElementById('play-btn');
const recordsBtn = document.getElementById('records-btn');

const leaderboardScreen = document.getElementById('leaderboard-screen');
const leaderboardBody = document.getElementById('leaderboard-body');
const leaderboardEmpty = document.getElementById('leaderboard-empty');
const leaderboardBackBtn = document.getElementById('leaderboard-back-btn');
const tabButtons = document.querySelectorAll('.tab-btn');

const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const bestScoreFinalEl = document.getElementById('best-score-final');
const newRecordBadge = document.getElementById('new-record-badge');
const restartBtn = document.getElementById('restart-btn');
const menuBtn = document.getElementById('menu-btn');

// ==================================================================
// RESOLUCIÓN / RESPONSIVE
// ==================================================================
let cssWidth = 0;
let cssHeight = 0;

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    cssWidth = canvas.clientWidth;
    cssHeight = canvas.clientHeight;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    basket.width = cssWidth * 0.22;
    basket.height = basket.width * 0.6;
    basket.y = cssHeight - basket.height - cssHeight * 0.03;
    clampBasket();
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 200));

// ==================================================================
// ESTADO DEL JUEGO
// ==================================================================
const STARTING_LIVES = 3;

let playerName = localStorage.getItem(CONFIG.LOCAL_STORAGE_NAME_KEY) || '';
let score = 0;
let bestScore = Number(localStorage.getItem(CONFIG.LOCAL_STORAGE_BEST_KEY)) || 0;
let lives = STARTING_LIVES;
let gameRunning = false;
let items = [];
let spawnTimer = 0;
let lastTime = 0;
let isFirstFrame = true;
let elapsedSeconds = 0;
let animationFrameId = null;
let isStarting = false;

const basket = { width: 0, height: 0, x: 0, y: 0 };

function resetGameState() {
    score = 0;
    lives = STARTING_LIVES;
    items = [];
    spawnTimer = 0;
    elapsedSeconds = 0;
    lastTime = 0;
    isFirstFrame = true;
}

// ==================================================================
// DIFICULTAD PROGRESIVA
// ==================================================================
const DIFFICULTY = {
    baseSpawnInterval: 1100,
    minSpawnInterval: 350,
    baseSpeedFactor: 0.0028,
    maxSpeedFactor: 0.009,
    rampUpSeconds: 90
};

function getCurrentSpawnInterval() {
    const progress = Math.min(elapsedSeconds / DIFFICULTY.rampUpSeconds, 1);
    return DIFFICULTY.baseSpawnInterval -
        progress * (DIFFICULTY.baseSpawnInterval - DIFFICULTY.minSpawnInterval);
}

function getCurrentSpeedFactor() {
    const progress = Math.min(elapsedSeconds / DIFFICULTY.rampUpSeconds, 1);
    return DIFFICULTY.baseSpeedFactor +
        progress * (DIFFICULTY.maxSpeedFactor - DIFFICULTY.baseSpeedFactor);
}

// ==================================================================
// POOL DE ÍTEMS
// ==================================================================
let itemPool = [
    { type: 'good', color: '#ff3b30', points: 10, imageUrl: null },
    { type: 'good', color: '#ffcc00', points: 15, imageUrl: null },
    { type: 'bad',  color: '#5c3a21', points: 0,  imageUrl: null }
];

const imageCache = {};

async function loadItemPool() {
    // FUTURO (Supabase):
    // try {
    //     const res = await fetch(`${CONFIG.API_BASE_URL}/api/items`);
    //     itemPool = await res.json();
    // } catch (err) {
    //     console.warn('No se pudo cargar el pool remoto, uso el local.', err);
    // }

    const promises = itemPool
        .filter(item => item.imageUrl)
        .map(item => preloadImage(item.imageUrl));

    await Promise.all(promises);
}

function preloadImage(url) {
    return new Promise((resolve) => {
        if (imageCache[url]) return resolve();
        const img = new Image();
        img.onload = () => { imageCache[url] = img; resolve(); };
        img.onerror = () => resolve();
        img.src = url;
    });
}

// ==================================================================
// RÉCORDS
// Estructura de cada entrada: { name, score, date } donde date es un
// ISOString. Guardado local ahora; mismas funciones se reconectarán
// a Supabase/Render más adelante sin tocar el resto del juego.
// ==================================================================
function loadAllScores() {
    try {
        const raw = localStorage.getItem(CONFIG.LOCAL_STORAGE_SCORES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.warn('No se pudo leer la tabla de récords local.', err);
        return [];
    }
}

function persistAllScores(scores) {
    localStorage.setItem(CONFIG.LOCAL_STORAGE_SCORES_KEY, JSON.stringify(scores));
}

function saveBestScoreLocally(newScore) {
    if (newScore > bestScore) {
        bestScore = newScore;
        localStorage.setItem(CONFIG.LOCAL_STORAGE_BEST_KEY, String(bestScore));
        return true;
    }
    return false;
}

async function submitScore(finalScore) {
    const isNewRecord = saveBestScoreLocally(finalScore);

    const entry = {
        name: playerName || 'Jugador',
        score: finalScore,
        date: new Date().toISOString()
    };

    const scores = loadAllScores();
    scores.push(entry);
    // límite razonable para no acumular infinito en localStorage
    if (scores.length > 500) scores.shift();
    persistAllScores(scores);

    // FUTURO (backend en Render + Supabase):
    // try {
    //     await fetch(`${CONFIG.API_BASE_URL}/api/scores`, {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json' },
    //         body: JSON.stringify(entry)
    //     });
    // } catch (err) {
    //     console.warn('No se pudo enviar la puntuación al servidor.', err);
    // }

    return isNewRecord;
}

function isSameDay(isoDateA, isoDateB) {
    return isoDateA.slice(0, 10) === isoDateB.slice(0, 10);
}

async function fetchLeaderboard(scope) {
    // FUTURO (Supabase):
    // try {
    //     const res = await fetch(`${CONFIG.API_BASE_URL}/api/scores/${scope}`);
    //     return await res.json();
    // } catch (err) {
    //     console.warn('No se pudo obtener el ranking remoto.', err);
    // }

    const all = loadAllScores();
    const todayIso = new Date().toISOString();

    const filtered = scope === 'today'
        ? all.filter(entry => isSameDay(entry.date, todayIso))
        : all;

    return filtered.sort((a, b) => b.score - a.score);
}

function formatDate(isoDate) {
    const d = new Date(isoDate);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) +
        ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ==================================================================
// CONTROLES
// ==================================================================
canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    moveBasketTo(e);
});

canvas.addEventListener('pointermove', (e) => {
    if (e.pressure === 0 && e.pointerType === 'touch') return;
    moveBasketTo(e);
});

function moveBasketTo(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    basket.x = x - basket.width / 2;
    clampBasket();
}

let keys = { left: false, right: false };
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'ArrowRight') keys.right = true;
});
document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
});

function clampBasket() {
    if (basket.x < 0) basket.x = 0;
    if (basket.x + basket.width > cssWidth) {
        basket.x = cssWidth - basket.width;
    }
}

// ==================================================================
// CREACIÓN DE OBJETOS QUE CAEN
// ==================================================================
function spawnItem() {
    const data = itemPool[Math.floor(Math.random() * itemPool.length)];
    const radius = cssWidth * 0.045;
    const speedFactor = getCurrentSpeedFactor();

    items.push({
        x: Math.random() * (cssWidth - radius * 2) + radius,
        y: -radius,
        radius: radius,
        speed: cssHeight * speedFactor * (0.85 + Math.random() * 0.3),
        color: data.color,
        type: data.type,
        points: data.points,
        image: data.imageUrl ? imageCache[data.imageUrl] : null
    });
}

// ==================================================================
// DIBUJO
// ==================================================================
function drawBasket() {
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(basket.x, basket.y, basket.width, basket.height);
    ctx.strokeStyle = '#5c3a1a';
    ctx.lineWidth = 3;
    ctx.strokeRect(basket.x, basket.y, basket.width, basket.height);
}

function drawItems() {
    items.forEach(item => {
        if (item.image) {
            const size = item.radius * 2;
            ctx.drawImage(item.image, item.x - item.radius, item.y - item.radius, size, size);
        } else {
            ctx.beginPath();
            ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
            ctx.fillStyle = item.color;
            ctx.fill();
        }
    });
}

function clearCanvas() {
    ctx.clearRect(0, 0, cssWidth, cssHeight);
}

// ==================================================================
// COLISIONES
// ==================================================================
function checkCollision(item) {
    return (
        item.y + item.radius >= basket.y &&
        item.y - item.radius <= basket.y + basket.height &&
        item.x + item.radius >= basket.x &&
        item.x - item.radius <= basket.x + basket.width
    );
}

// ==================================================================
// ACTUALIZACIÓN DE ESTADO
// ==================================================================
function updateItems(deltaTime) {
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.y += item.speed * (deltaTime / 16);

        if (checkCollision(item)) {
            if (item.type === 'good') {
                score += item.points;
            } else {
                lives -= 1;
            }
            items.splice(i, 1);
            continue;
        }

        if (item.y - item.radius > cssHeight) {
            if (item.type === 'good') lives -= 1;
            items.splice(i, 1);
        }
    }
}

function updateHUD() {
    scoreEl.textContent = `Puntos: ${score}`;
    bestScoreEl.textContent = `Récord: ${bestScore}`;
    livesEl.textContent = `Vidas: ${lives}`;
}

async function checkGameOver() {
    if (lives <= 0 && gameRunning) {
        gameRunning = false;
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        const isNewRecord = await submitScore(score);

        finalScoreEl.textContent = `Puntuación: ${score}`;
        bestScoreFinalEl.textContent = `Récord: ${bestScore}`;
        newRecordBadge.classList.toggle('hidden', !isNewRecord);
        gameOverScreen.classList.remove('hidden');
    }
}

// ==================================================================
// BUCLE PRINCIPAL
// ==================================================================
function gameLoop(timestamp) {
    if (!gameRunning) return;

    let deltaTime;
    if (isFirstFrame) {
        deltaTime = 16;
        isFirstFrame = false;
    } else {
        deltaTime = Math.min(timestamp - lastTime, 50);
    }
    lastTime = timestamp;

    elapsedSeconds += deltaTime / 1000;

    if (keys.left) basket.x -= cssWidth * 0.015;
    if (keys.right) basket.x += cssWidth * 0.015;
    clampBasket();

    spawnTimer += deltaTime;
    if (spawnTimer > getCurrentSpawnInterval()) {
        spawnItem();
        spawnTimer = 0;
    }

    clearCanvas();
    updateItems(deltaTime);
    drawBasket();
    drawItems();
    updateHUD();
    checkGameOver();

    if (gameRunning) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

// ==================================================================
// NAVEGACIÓN ENTRE PANTALLAS
// ==================================================================
function showScreen(screen) {
    [menuScreen, leaderboardScreen, gameOverScreen, loadingScreen].forEach(s => {
        s.classList.add('hidden');
    });
    screen.classList.remove('hidden');
}

function goToMenu() {
    playerNameInput.value = playerName;
    showScreen(menuScreen);
}

// ---------- Splash ----------
splashImage.addEventListener('error', () => {
    splashImage.classList.add('hidden');
    splashFallback.classList.remove('hidden');
});

let itemsLoaded = false;

function dismissSplash() {
    splashScreen.classList.add('fade-out');
    splashScreen.addEventListener('transitionend', () => {
        splashScreen.classList.add('hidden');
        if (itemsLoaded) {
            goToMenu();
        } else {
            showScreen(loadingScreen);
        }
    }, { once: true });
}

splashScreen.addEventListener('click', dismissSplash);
splashScreen.addEventListener('touchstart', (e) => {
    e.preventDefault();
    dismissSplash();
}, { passive: false });

// ---------- Menú: nombre + jugar ----------
playerNameInput.addEventListener('input', () => {
    nameError.classList.add('hidden');
});

playBtn.addEventListener('click', () => {
    const value = playerNameInput.value.trim();
    if (!value) {
        nameError.classList.remove('hidden');
        return;
    }
    playerName = value;
    localStorage.setItem(CONFIG.LOCAL_STORAGE_NAME_KEY, playerName);
    startGame();
});

// ---------- Menú: récords ----------
let currentTab = 'today';

recordsBtn.addEventListener('click', () => {
    showScreen(leaderboardScreen);
    renderLeaderboard(currentTab);
});

leaderboardBackBtn.addEventListener('click', goToMenu);

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderLeaderboard(currentTab);
    });
});

async function renderLeaderboard(scope) {
    const scores = await fetchLeaderboard(scope);
    leaderboardBody.innerHTML = '';

    if (scores.length === 0) {
        leaderboardEmpty.classList.remove('hidden');
        return;
    }

    leaderboardEmpty.classList.add('hidden');

    scores.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHtml(entry.name)}</td>
            <td>${entry.score}</td>
            <td>${formatDate(entry.date)}</td>
        `;
        leaderboardBody.appendChild(row);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---------- Game over ----------
restartBtn.addEventListener('click', startGame);
menuBtn.addEventListener('click', goToMenu);

// ==================================================================
// INICIO / REINICIO DE PARTIDA
// ==================================================================
function startGame() {
    if (isStarting) return;
    isStarting = true;

    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    resetGameState();
    gameRunning = true;

    menuScreen.classList.add('hidden');
    leaderboardScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    resizeCanvas();
    updateHUD();

    animationFrameId = requestAnimationFrame(gameLoop);

    setTimeout(() => { isStarting = false; }, 300);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && gameRunning) {
        isFirstFrame = true;
    }
});

// ==================================================================
// ARRANQUE
// ==================================================================
(async function init() {
    resizeCanvas();
    updateHUD();
    await loadItemPool();
    itemsLoaded = true;

    // Si el splash ya se cerró antes de terminar de cargar, pasa al menú.
    if (splashScreen.classList.contains('hidden')) {
        goToMenu();
    }
})();