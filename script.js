// ==================================================================
// CONFIGURACIÓN
// ==================================================================
const CONFIG = {
    LOCAL_STORAGE_NAME_KEY: 'atrapaFruta_playerName'
};

// ==================================================================
// SUPABASE
// ==================================================================
const SUPABASE_URL = 'https://pstcedrpzamioodlzjgu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzdGNlZHJwemFtaW9vZGx6amd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNDE5MzAsImV4cCI6MjA5ODgxNzkzMH0.1C_CG4-OrnNb4FU8qNrf2-nTMJugFYBQ7E1qa4z0-g4';

// Nombre de tu tabla en Supabase. Cámbialo aquí si se llama distinto.
const SCORES_TABLE = 'scores';

// Nombre del bucket de Storage donde están las imágenes de las frutas/productos.
const STORAGE_BUCKET = 'products1';

// Nombre del bucket de Storage con las imágenes de la cesta (progresión 29 -> 34).
const BASKET_BUCKET = 'lungs';
const BASKET_MIN_NUMBER = 29;
const BASKET_MAX_NUMBER = 34;
const CATCHES_PER_BASKET_LEVEL = 10;
// Cuánto más grande se dibuja la imagen del pulmón respecto a su área de colisión real
// (el hitbox no cambia, solo el tamaño visual de la imagen).
const BASKET_VISUAL_SCALE = 2.1;

// Cuánto más grandes se dibujan (y se atrapan, ya que el radio también es su hitbox)
// los ítems que caen: products1 y fruta.
const ITEM_VISUAL_SCALE = 1.5;
const BASE_ITEM_RADIUS_FACTOR = 0.045;

// Nombre del bucket de Storage con el fondo de bosque (según vidas restantes: 38 -> 37 -> 36).
const FOREST_BUCKET = 'forest';

// Nombre del bucket de Storage con las "frutas" trampa: restan puntos y retroceden la cesta un nivel.
const FRUIT_BUCKET = 'fruta';
const FRUIT_PENALTY_POINTS = 50;
// Frecuencia de aparición de la fruta: mucho más baja que la de los ítems normales.
const FRUIT_SPAWN_MIN_INTERVAL = 6000; // ms
const FRUIT_SPAWN_MAX_INTERVAL = 10000; // ms

// A partir de esta puntuación, los ítems de "products1" también caen en diagonal.
const DIAGONAL_SCORE_THRESHOLD = 2000;
const DIAGONAL_SPEED_FACTOR = 0.0022; // desplazamiento horizontal, similar orden que la caída

// Rotación lenta de todos los ítems que caen (fruta y products1).
const ROTATION_SPEED_MIN = 0.00012; // rad por frame (a 60fps aprox.) — los más lentos
const ROTATION_SPEED_MAX = 0.0032;  // los más rápidos

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================================================================
// ELEMENTOS DEL DOM
// ==================================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const livesEl = document.getElementById('lives');

const loadingScreen = document.getElementById('loading-screen');
const loadingProgressFill = document.getElementById('loading-progress-fill');
const loadingProgressLabel = document.getElementById('loading-progress-label');

const menuScreen = document.getElementById('menu-screen');
const playerNameInput = document.getElementById('player-name');
const nameError = document.getElementById('name-error');
const playBtn = document.getElementById('play-btn');
const recordsBtn = document.getElementById('records-btn');

const leaderboardScreen = document.getElementById('leaderboard-screen');
const leaderboardBody = document.getElementById('leaderboard-body');
const leaderboardEmpty = document.getElementById('leaderboard-empty');
const leaderboardBackBtn = document.getElementById('leaderboard-back-btn');
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
const totalGamesEl = document.getElementById('total-games-played');

const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const bestScoreFinalEl = document.getElementById('best-score-final');
const newRecordBadge = document.getElementById('new-record-badge');
const restartBtn = document.getElementById('restart-btn');
const menuBtn = document.getElementById('menu-btn');

// ==================================================================
// RESPONSIVE / CANVAS
// ==================================================================
let cssWidth = 0;
let cssHeight = 0;
const basket = { width: 0, height: 0, x: 0, y: 0 };

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
    if (basket.x === 0) basket.x = cssWidth / 2 - basket.width / 2;
    clampBasket();
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 200));

function clampBasket() {
    if (basket.x < 0) basket.x = 0;
    if (basket.x + basket.width > cssWidth) basket.x = cssWidth - basket.width;
}

// ==================================================================
// ESTADO DEL JUEGO
// ==================================================================
const STARTING_LIVES = 3;

let playerName = localStorage.getItem(CONFIG.LOCAL_STORAGE_NAME_KEY) || '';
let score = 0;
let bestScore = 0; // SIEMPRE se rellena desde Supabase, nunca desde localStorage.
let lives = STARTING_LIVES;
let gameRunning = false;
let items = [];
let spawnTimer = 0;
let lastTime = 0;
let isFirstFrame = true;
let elapsedSeconds = 0;
let animationFrameId = null;
let isStarting = false;
let catchCount = 0; // Cuántas frutas se han atrapado en la partida actual (progresión de la cesta).
let fruitSpawnTimer = 0;
let nextFruitSpawnDelay = getRandomFruitDelay();

function getRandomFruitDelay() {
    return FRUIT_SPAWN_MIN_INTERVAL + Math.random() * (FRUIT_SPAWN_MAX_INTERVAL - FRUIT_SPAWN_MIN_INTERVAL);
}

function resetGameState() {
    score = 0;
    lives = STARTING_LIVES;
    items = [];
    spawnTimer = 0;
    elapsedSeconds = 0;
    lastTime = 0;
    isFirstFrame = true;
    catchCount = 0;
    fruitSpawnTimer = 0;
    nextFruitSpawnDelay = getRandomFruitDelay();
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
    return DIFFICULTY.baseSpawnInterval - progress * (DIFFICULTY.baseSpawnInterval - DIFFICULTY.minSpawnInterval);
}

function getCurrentSpeedFactor() {
    const progress = Math.min(elapsedSeconds / DIFFICULTY.rampUpSeconds, 1);
    return DIFFICULTY.baseSpeedFactor + progress * (DIFFICULTY.maxSpeedFactor - DIFFICULTY.baseSpeedFactor);
}

// ==================================================================
// POOL DE ÍTEMS
// ==================================================================
// Pool de respaldo (círculos de color) por si Storage falla o el bucket está vacío.
let itemPool = [
    { type: 'good', color: '#ff3b30', points: 10, imageUrl: null },
    { type: 'good', color: '#ffcc00', points: 10, imageUrl: null }
];

const imageCache = {};

// Marca de tiempo única por carga de la app: se añade a cada URL para que
// el navegador y el CDN de Supabase SIEMPRE pidan el archivo de nuevo,
// nunca una copia guardada en caché de una versión anterior.
const CACHE_BUST = Date.now();

function withCacheBust(url) {
    if (!url) return url;
    return `${url}?v=${CACHE_BUST}`;
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

// Lista las imágenes del bucket de Storage y construye el pool de ítems a partir de ellas.
async function loadItemPoolFromStorage() {
    console.log(`[Storage] Buscando imágenes en el bucket "${STORAGE_BUCKET}"...`);

    const { data, error } = await supabaseClient
        .storage
        .from(STORAGE_BUCKET)
        .list('', { limit: 200 });

    if (error) {
        console.error('[Storage] ERROR al listar el bucket. Revisa el nombre del bucket y las políticas de RLS de Storage:', error);
        return;
    }

    console.log('[Storage] Respuesta cruda de list():', data);

    const imageFiles = (data || []).filter(file =>
        /\.(png|jpg|jpeg|webp)$/i.test(file.name)
    );

    if (imageFiles.length === 0) {
        console.warn('[Storage] El bucket existe pero no se encontró ningún archivo .png/.jpg/.jpeg/.webp en la raíz. Se usa el pool de respaldo.');
        return;
    }

    const newPool = imageFiles.map(file => {
        const { data: urlData } = supabaseClient
            .storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(file.name);

        return {
            type: 'good',
            color: '#ffcc00',
            points: 10,
            imageUrl: withCacheBust(urlData.publicUrl)
        };
    });

    console.log(`[Storage] ${newPool.length} imágenes encontradas. Ejemplo de URL:`, newPool[0].imageUrl);

    itemPool = newPool;
}

async function loadItemPool() {
    await loadItemPoolFromStorage();
    const promises = itemPool.filter(i => i.imageUrl).map(i => preloadImage(i.imageUrl));
    await Promise.all(promises);

    const loadedCount = itemPool.filter(i => i.imageUrl && imageCache[i.imageUrl]).length;
    console.log(`[Storage] Imágenes precargadas correctamente: ${loadedCount} de ${itemPool.length}.`);
}

// ==================================================================
// POOL DE "FRUTA" (ítem trampa) — bucket "fruta"
// ==================================================================
let fruitPool = [];

async function loadFruitPoolFromStorage() {
    console.log(`[Storage] Buscando imágenes en el bucket "${FRUIT_BUCKET}"...`);

    const { data, error } = await supabaseClient
        .storage
        .from(FRUIT_BUCKET)
        .list('', { limit: 200 });

    if (error) {
        console.error('[Storage] ERROR al listar el bucket de fruta. Revisa el nombre del bucket y las políticas de RLS de Storage:', error);
        return;
    }

    const imageFiles = (data || []).filter(file =>
        /\.(png|jpg|jpeg|webp)$/i.test(file.name)
    );

    if (imageFiles.length === 0) {
        console.warn('[Storage] El bucket "fruta" no tiene imágenes. No caerá fruta trampa en esta partida.');
        return;
    }

    fruitPool = imageFiles.map(file => {
        const { data: urlData } = supabaseClient
            .storage
            .from(FRUIT_BUCKET)
            .getPublicUrl(file.name);

        return {
            type: 'fruit',
            color: '#e21b3c',
            points: -FRUIT_PENALTY_POINTS,
            imageUrl: withCacheBust(urlData.publicUrl)
        };
    });

    console.log(`[Storage] ${fruitPool.length} imágenes de fruta encontradas. Ejemplo de URL:`, fruitPool[0].imageUrl);
}

async function loadFruitPool() {
    await loadFruitPoolFromStorage();
    const promises = fruitPool.filter(i => i.imageUrl).map(i => preloadImage(i.imageUrl));
    await Promise.all(promises);

    const loadedCount = fruitPool.filter(i => i.imageUrl && imageCache[i.imageUrl]).length;
    console.log(`[Storage] Imágenes de fruta precargadas correctamente: ${loadedCount} de ${fruitPool.length}.`);
}

// ==================================================================
// CESTA — imágenes progresivas desde el bucket "lungs" (29 -> 34)
// ==================================================================
let basketImageUrls = []; // ordenadas del número más bajo (29) al más alto (34)

async function loadBasketImagesFromStorage() {
    console.log(`[Storage] Buscando imágenes de la cesta en el bucket "${BASKET_BUCKET}"...`);

    const { data, error } = await supabaseClient
        .storage
        .from(BASKET_BUCKET)
        .list('', { limit: 200 });

    if (error) {
        console.error('[Storage] ERROR al listar el bucket de la cesta. Revisa el nombre y las políticas de RLS de Storage:', error);
        return;
    }

    const imageFiles = (data || []).filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file.name));

    if (imageFiles.length === 0) {
        console.warn('[Storage] El bucket "lungs" no tiene imágenes. Se usa la cesta dibujada por defecto.');
        return;
    }

    // Ordenar numéricamente por el nombre del archivo (29.png, 30.png, ... 34.png)
    imageFiles.sort((a, b) => {
        const numA = parseInt(a.name, 10);
        const numB = parseInt(b.name, 10);
        return numA - numB;
    });

    basketImageUrls = imageFiles.map(file => {
        const { data: urlData } = supabaseClient
            .storage
            .from(BASKET_BUCKET)
            .getPublicUrl(file.name);
        return withCacheBust(urlData.publicUrl);
    });

    console.log(`[Storage] ${basketImageUrls.length} imágenes de cesta encontradas (orden):`, basketImageUrls);

    await Promise.all(basketImageUrls.map(url => preloadImage(url)));

    const loadedCount = basketImageUrls.filter(url => imageCache[url]).length;
    console.log(`[Storage] Imágenes de cesta precargadas: ${loadedCount} de ${basketImageUrls.length}.`);
}

// Nivel máximo posible de la cesta según cuántas imágenes se cargaron.
function getMaxBasketLevel() {
    return basketImageUrls.length > 0 ? basketImageUrls.length - 1 : 0;
}

// Devuelve la imagen de cesta correspondiente al nivel actual (según capturas acumuladas).
function getCurrentBasketImage() {
    if (basketImageUrls.length === 0) return null;

    const level = Math.min(Math.floor(catchCount / CATCHES_PER_BASKET_LEVEL), getMaxBasketLevel());
    const url = basketImageUrls[level];
    return imageCache[url] || null;
}

// ==================================================================
// FONDO DE BOSQUE — bucket "forest" (38 = todas las vidas -> 36 = última vida)
// ==================================================================
let forestImageUrls = []; // ordenadas de mayor número (38, más vidas) a menor (36, última vida)

async function loadForestImagesFromStorage() {
    console.log(`[Storage] Buscando imágenes del bosque en el bucket "${FOREST_BUCKET}"...`);

    const { data, error } = await supabaseClient
        .storage
        .from(FOREST_BUCKET)
        .list('', { limit: 200 });

    if (error) {
        console.error('[Storage] ERROR al listar el bucket del bosque. Revisa el nombre y las políticas de RLS de Storage:', error);
        return;
    }

    const imageFiles = (data || []).filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file.name));

    if (imageFiles.length === 0) {
        console.warn('[Storage] El bucket "forest" no tiene imágenes. Se usa el fondo por defecto.');
        return;
    }

    // Orden descendente por número de archivo: 38 (más vidas) primero, 36 (última vida) al final.
    imageFiles.sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));

    forestImageUrls = imageFiles.map(file => {
        const { data: urlData } = supabaseClient
            .storage
            .from(FOREST_BUCKET)
            .getPublicUrl(file.name);
        return withCacheBust(urlData.publicUrl);
    });

    console.log(`[Storage] ${forestImageUrls.length} imágenes de bosque encontradas (orden):`, forestImageUrls);

    await Promise.all(forestImageUrls.map(url => preloadImage(url)));

    const loadedCount = forestImageUrls.filter(url => imageCache[url]).length;
    console.log(`[Storage] Imágenes de bosque precargadas: ${loadedCount} de ${forestImageUrls.length}.`);
}

// Devuelve la imagen de bosque según las vidas restantes (3 vidas -> primera imagen, 1 vida -> última).
function getCurrentForestImage() {
    if (forestImageUrls.length === 0) return null;

    const maxIndex = forestImageUrls.length - 1;
    const lostLives = STARTING_LIVES - lives;
    const index = Math.min(Math.max(lostLives, 0), maxIndex);
    const url = forestImageUrls[index];
    return imageCache[url] || null;
}

// Tamaño del bosque: ocupa todo el ancho del canvas; este factor solo controla
// el alto (más bajo = más pequeño), el ancho siempre es cssWidth completo.
const FOREST_HEIGHT_BOOST = 0.55;

function drawForestBackground() {
    const forestImage = getCurrentForestImage();
    if (!forestImage) return; // sin imagen, se queda el fondo de degradado del CSS

    const naturalWidth = forestImage.naturalWidth || forestImage.width;
    const naturalHeight = forestImage.naturalHeight || forestImage.height;
    if (!naturalWidth || !naturalHeight) return;

    const aspectRatio = naturalWidth / naturalHeight;

    // Ancho completo del canvas, alto proporcional (con un extra para que se vea más grande).
    const drawWidth = cssWidth;
    const drawHeight = (drawWidth / aspectRatio) * FOREST_HEIGHT_BOOST;

    // Pegada al borde inferior del canvas, ocupando todo el ancho.
    const drawX = 0;
    const drawY = cssHeight - drawHeight;

    ctx.drawImage(forestImage, drawX, drawY, drawWidth, drawHeight);
}

// ==================================================================
// RÉCORD GLOBAL — SIEMPRE desde Supabase (igual en cualquier dispositivo)
// ==================================================================
async function fetchGlobalBestScore() {
    const { data, error } = await supabaseClient
        .from(SCORES_TABLE)
        .select('score')
        .order('score', { ascending: false })
        .limit(1);

    if (error) {
        console.error('[Récord] No se pudo obtener el récord global de Supabase.', error);
        return null;
    }

    if (!data || data.length === 0) return 0;
    return data[0].score;
}

async function refreshGlobalBestScore() {
    const globalBest = await fetchGlobalBestScore();
    if (globalBest !== null) {
        bestScore = globalBest;
        updateHUD();
    }
    return bestScore;
}

async function submitScore(finalScore) {
    const previousBest = bestScore;

    const { error } = await supabaseClient
        .from(SCORES_TABLE)
        .insert([{ player_name: playerName || 'Jugador', score: finalScore }]);

    if (error) {
        console.error('[Récord] No se pudo guardar la puntuación en Supabase.', error);
    }

    // Volvemos a leer el récord real de la base de datos tras insertar.
    await refreshGlobalBestScore();

    return finalScore > previousBest;
}

async function fetchLeaderboard(scope) {
    let query = supabaseClient
        .from(SCORES_TABLE)
        .select('player_name, score, created_at')
        .order('score', { ascending: false })
        .limit(50);

    if (scope === 'today') {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        query = query.gte('created_at', startOfDay.toISOString());
    }

    const { data, error } = await query;

    if (error) {
        console.warn('No se pudo obtener el ranking de Supabase.', error);
        return [];
    }

    return data.map(entry => ({
        name: entry.player_name,
        score: entry.score,
        date: entry.created_at
    }));
}

async function fetchTotalGamesPlayed() {
    const { count, error } = await supabaseClient
        .from(SCORES_TABLE)
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.warn('No se pudo obtener el total de partidas jugadas.', error);
        return null;
    }

    return count;
}

async function updateTotalGamesPlayed() {
    if (!totalGamesEl) return;
    const count = await fetchTotalGamesPlayed();
    if (count !== null) {
        totalGamesEl.textContent = `Partidas jugadas: ${count}`;
    }
}

function formatDate(isoDate) {
    const d = new Date(isoDate);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) +
        ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

async function renderLeaderboard(scope) {
    leaderboardBody.innerHTML = '';
    leaderboardEmpty.classList.add('hidden');
    leaderboardEmpty.textContent = 'Todavía no hay puntuaciones.';

    let scores;
    try {
        scores = await fetchLeaderboard(scope);
    } catch (err) {
        console.warn('Error inesperado al cargar el ranking.', err);
        leaderboardEmpty.textContent = 'No se pudo cargar el ranking. Revisa tu conexión.';
        leaderboardEmpty.classList.remove('hidden');
        return;
    }

    if (!scores || scores.length === 0) {
        leaderboardEmpty.classList.remove('hidden');
        return;
    }

    scores.forEach((entry, index) => {
        const row = document.createElement('tr');

        const cellIndex = document.createElement('td');
        cellIndex.textContent = String(index + 1);

        const cellName = document.createElement('td');
        cellName.textContent = entry.name;

        const cellScore = document.createElement('td');
        cellScore.textContent = String(entry.score);

        const cellDate = document.createElement('td');
        cellDate.textContent = formatDate(entry.date);

        row.appendChild(cellIndex);
        row.appendChild(cellName);
        row.appendChild(cellScore);
        row.appendChild(cellDate);
        leaderboardBody.appendChild(row);
    });
}

// ==================================================================
// CONTROLES DE LA CANASTA
// ==================================================================
// Deslizar para mover: tocar y no mover el dedo no desplaza el pulmón; solo se
// mueve la cantidad exacta que deslizas el dedo (arrastre relativo, no salto al tocar).
let isDragging = false;
let dragStartX = 0;
let basketStartX = 0;

canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    isDragging = true;
    dragStartX = e.clientX - rect.left;
    basketStartX = basket.x;
});

canvas.addEventListener('pointermove', (e) => {
    if (!isDragging) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    basket.x = basketStartX + (currentX - dragStartX);
    clampBasket();
});

function stopDragging() {
    isDragging = false;
}

canvas.addEventListener('pointerup', stopDragging);
canvas.addEventListener('pointercancel', stopDragging);
canvas.addEventListener('pointerleave', stopDragging);

let keys = { left: false, right: false };
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'ArrowRight') keys.right = true;
});
document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
});

// ==================================================================
// OBJETOS QUE CAEN
// ==================================================================
function spawnItemFromPool(pool) {
    if (pool.length === 0) return;

    const data = pool[Math.floor(Math.random() * pool.length)];
    const radius = cssWidth * BASE_ITEM_RADIUS_FACTOR * ITEM_VISUAL_SCALE;
    const speedFactor = getCurrentSpeedFactor();

    // A partir de DIAGONAL_SCORE_THRESHOLD puntos, los ítems de "products1" (type 'good')
    // también se desplazan en diagonal, rebotando en los bordes del canvas.
    let vx = 0;
    if (data.type === 'good' && score >= DIAGONAL_SCORE_THRESHOLD) {
        const direction = Math.random() < 0.5 ? -1 : 1;
        vx = direction * cssWidth * DIAGONAL_SPEED_FACTOR * (0.7 + Math.random() * 0.6);
    }

    // Todos los ítems (fruta y products1) giran muy lentamente mientras caen.
    const rotationDirection = Math.random() < 0.5 ? -1 : 1;
    const rotationSpeed = rotationDirection * (ROTATION_SPEED_MIN + Math.random() * (ROTATION_SPEED_MAX - ROTATION_SPEED_MIN));

    items.push({
        x: Math.random() * (cssWidth - radius * 2) + radius,
        y: -radius,
        radius: radius,
        speed: cssHeight * speedFactor * (0.85 + Math.random() * 0.3),
        vx: vx,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: rotationSpeed,
        color: data.color,
        type: data.type,
        points: data.points,
        image: data.imageUrl ? imageCache[data.imageUrl] : null
    });
}

function spawnItem() {
    spawnItemFromPool(itemPool);
}

function spawnFruitItem() {
    spawnItemFromPool(fruitPool);
}

// Rectángulo de dibujo del pulmón: más grande que el hitbox real, pero anclado
// al mismo centro horizontal y a la misma base, para que la colisión no cambie.
function getBasketDrawRect() {
    const drawWidth = basket.width * BASKET_VISUAL_SCALE;
    const drawHeight = basket.height * BASKET_VISUAL_SCALE;
    return {
        x: basket.x + basket.width / 2 - drawWidth / 2,
        y: basket.y + basket.height - drawHeight,
        width: drawWidth,
        height: drawHeight
    };
}

function drawBasket() {
    const basketImage = getCurrentBasketImage();
    const rect = getBasketDrawRect();

    if (basketImage) {
        ctx.drawImage(basketImage, rect.x, rect.y, rect.width, rect.height);
        return;
    }

    // Respaldo: cesta dibujada si las imágenes de Storage no cargaron.
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = '#5c3a1a';
    ctx.lineWidth = 3;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

function drawItems() {
    items.forEach(item => {
        if (item.image) {
            const size = item.radius * 2;
            const naturalWidth = item.image.naturalWidth || item.image.width || 1;
            const naturalHeight = item.image.naturalHeight || item.image.height || 1;
            const aspectRatio = naturalWidth / naturalHeight;

            // Ajuste "contain": el lado más largo ocupa `size`, el otro se calcula
            // según la proporción real de la imagen, para que no se deforme.
            let drawWidth = size;
            let drawHeight = size;
            if (aspectRatio > 1) {
                drawHeight = size / aspectRatio;
            } else if (aspectRatio < 1) {
                drawWidth = size * aspectRatio;
            }

            ctx.save();
            ctx.translate(item.x, item.y);
            ctx.rotate(item.rotation);
            ctx.drawImage(item.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            ctx.restore();
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

function checkCollision(item) {
    return (
        item.y + item.radius >= basket.y &&
        item.y - item.radius <= basket.y + basket.height &&
        item.x + item.radius >= basket.x &&
        item.x - item.radius <= basket.x + basket.width
    );
}

function updateItems(deltaTime) {
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        const step = deltaTime / 16;

        item.y += item.speed * step;

        if (item.vx) {
            item.x += item.vx * step;
            if (item.x - item.radius < 0) {
                item.x = item.radius;
                item.vx = Math.abs(item.vx);
            } else if (item.x + item.radius > cssWidth) {
                item.x = cssWidth - item.radius;
                item.vx = -Math.abs(item.vx);
            }
        }

        item.rotation += item.rotationSpeed * step;

        if (checkCollision(item)) {
            if (item.type === 'good') {
                score += item.points;
                // Se limita al tope del nivel máximo para que, si la fruta resta un nivel
                // justo después, siempre retroceda a la cesta anterior real (nunca se queda
                // "atascada" en el nivel máximo por haber acumulado capturas de más).
                catchCount = Math.min(catchCount + 1, getMaxBasketLevel() * CATCHES_PER_BASKET_LEVEL);
            } else if (item.type === 'fruit') {
                score = Math.max(0, score + item.points);
                catchCount = Math.max(catchCount - CATCHES_PER_BASKET_LEVEL, 0);
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

let gameOverHandled = false;

async function checkGameOver() {
    if (lives <= 0 && gameRunning && !gameOverHandled) {
        gameOverHandled = true;
        gameRunning = false;

        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        const isNewRecord = await submitScore(score);

        finalScoreEl.textContent = `Puntuación: ${score}`;
        bestScoreFinalEl.textContent = `Récord: ${bestScore}`;
        newRecordBadge.classList.toggle('hidden', !isNewRecord);
        showScreen(gameOverScreen);
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

    fruitSpawnTimer += deltaTime;
    if (fruitSpawnTimer > nextFruitSpawnDelay) {
        spawnFruitItem();
        fruitSpawnTimer = 0;
        nextFruitSpawnDelay = getRandomFruitDelay();
    }

    clearCanvas();
    drawForestBackground();
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
function showScreen(target) {
    [loadingScreen, menuScreen, leaderboardScreen, gameOverScreen].forEach(screen => {
        if (screen === target) screen.classList.remove('hidden');
        else screen.classList.add('hidden');
    });
}

function goToMenu() {
    playerNameInput.value = playerName;
    showScreen(menuScreen);
    updateTotalGamesPlayed();
    refreshGlobalBestScore();
}

// ==================================================================
// MENÚ: nombre + jugar + récords
// ==================================================================
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
    gameOverHandled = false;
    gameRunning = true;

    showScreen(null);

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
function updateLoadingProgress(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    if (loadingProgressFill) loadingProgressFill.style.width = `${pct}%`;
    if (loadingProgressLabel) loadingProgressLabel.textContent = `${pct}%`;
}

(async function init() {
    resizeCanvas();
    updateHUD();
    showScreen(loadingScreen);
    updateLoadingProgress(0, 1);

    // Cada tarea de carga (fotos de fruta, productos, cesta, bosque y récord global)
    // suma su propio "trozo" a la barra de progreso en cuanto termina, en vez de
    // quedarse fija hasta que todo esté listo.
    const loadingTasks = [
        loadItemPool(),
        loadFruitPool(),
        loadBasketImagesFromStorage(),
        loadForestImagesFromStorage(),
        refreshGlobalBestScore()
    ];

    let completedTasks = 0;
    const totalTasks = loadingTasks.length;

    loadingTasks.forEach(task => {
        task.then(() => {
            completedTasks += 1;
            updateLoadingProgress(completedTasks, totalTasks);
        });
    });

    await Promise.all(loadingTasks);

    goToMenu();
})();