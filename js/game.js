// ========================================
// SHIELD BREAKER - ベースゲーム
// 局地シールド防衛戦
// ========================================
(() => {
'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 600;
const H = 800;
canvas.width = W;
canvas.height = H;

// ==================== CONFIG ====================
const CFG = {
    SHIELD_W: 120,
    SHIELD_H: 14,
    SHIELD_Y: 690,
    SHIELD_SPEED: 7,
    SHIELD_CURVE: 12,

    BALL_R: 9,
    BALL_SPEED: 4.5,
    BALL_MIN_DY: 1.5,
    BALL_MAX: 20,

    MULTI_BALL_KILLS: 3,
    MULTI_BALL_CHANCE: 0.7,

    MULT_HIT_GAIN: 0.08,
    MULT_MAX: 5.0,
    MULT_DECAY_RATE: 0.003,
    MULT_DECAY_DELAY: 90,

    SHIP_W: 160,
    SHIP_VIS_H: 55,
    SHIP_HP: 5,
    SHIP_WANDER_SPEED: 1.2,

    ENEMY_COLS: 7,
    ENEMY_BASE_ROWS: 3,
    ENEMY_W: 48,
    ENEMY_H: 36,
    ENEMY_PAD: 10,
    ENEMY_TOP: 50,
    ENEMY_HSPEED: 0.8,
    ENEMY_DROP: 12,
    ENEMY_SHOOT_CD: 120,
    ENEMY_BULLET_SPEED: 3,
    ENEMY_MAX: 120,

    BLOCK_W: 55,
    BLOCK_H: 22,
    BLOCK_ROWS: 3,
    BLOCK_COLS: 9,
    BLOCK_TOP: 370,
    BLOCK_INDESTRUCTIBLE_RATIO: 0.08,

    BALL_DROP_SPAWN: 8,

    STAR_COUNT: 120,
};

// ==================== AUDIO ====================
const SND = {};
const SND_NAMES = [
    'bgm_main',
    'se_reflect', 'se_block_break', 'se_block_hit',
    'se_enemy_hit', 'se_enemy_shot', 'se_ship_damage',
    'se_ball_drop', 'se_wave_clear', 'se_wave_clear_special',
    'se_gameover', 'se_start'
];

function loadSounds() {
    SND_NAMES.forEach(name => {
        const a = new Audio();
        a.src = 'sound/' + name + '.mp3';
        a.preload = 'auto';
        if (name === 'bgm_main') { a.loop = true; a.volume = 0.4; }
        else { a.volume = 0.5; }
        SND[name] = a;
    });
}

function playSound(name) {
    const s = SND[name];
    if (!s || !s.duration) return;
    if (name.startsWith('se_')) {
        const clone = s.cloneNode();
        clone.volume = s.volume;
        clone.play().catch(() => {});
    } else {
        s.play().catch(() => {});
    }
}

function stopBGM() {
    const b = SND['bgm_main'];
    if (b) { b.pause(); b.currentTime = 0; }
}

// ==================== ASSETS ====================
const IMG = {};
const IMG_NAMES = [
    'enemy_small', 'enemy_medium', 'battleship',
    'ball', 'block_breakable', 'block_unbreakable'
];
let loaded = 0;

function loadImages(cb) {
    IMG_NAMES.forEach(name => {
        IMG[name] = new Image();
        IMG[name].onload = IMG[name].onerror = () => {
            if (++loaded >= IMG_NAMES.length) cb();
        };
        IMG[name].src = 'img/' + name + '.png';
    });
}

function prepareShipSprite() {
    const src = IMG.battleship;
    if (!src || !src.width) return;
    const c = document.createElement('canvas');
    c.width = src.height;
    c.height = src.width;
    const cx = c.getContext('2d');
    cx.translate(src.height / 2, src.width / 2);
    cx.rotate(-Math.PI / 2);
    cx.drawImage(src, -src.width / 2, -src.height / 2);
    IMG.ship_up = c;
}

// ==================== STATE ====================
let state = 'loading';
let score = 0;
let wave = 1;
let frame = 0;
let screenFlash = 0;

let mult = 1.0;
let multDecayTimer = 0;
let multFlash = 0;

let killsSinceLastBall = 0;

let shield = { x: W / 2, y: CFG.SHIELD_Y, w: CFG.SHIELD_W, h: CFG.SHIELD_H };

let balls = [];

let ship = {
    x: W / 2, y: H - CFG.SHIP_VIS_H / 2,
    w: CFG.SHIP_W, hp: 0, maxHp: 0,
    dir: 1, speed: CFG.SHIP_WANDER_SPEED, changeTimer: 60
};

let enemies = [];
let blocks = [];
let bullets = [];
let particles = [];
let stars = [];

let enemyDir = 1;
let enemyMoveTimer = 0;

let keys = {};
let mouseX = W / 2;
let useMouse = false;

// ==================== INPUT ====================
document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleAction(); }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouseX = (e.clientX - r.left) * (W / r.width);
    useMouse = true;
});
canvas.addEventListener('click', e => { e.preventDefault(); handleAction(); });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    mouseX = (e.touches[0].clientX - r.left) * (W / r.width);
    useMouse = true;
}, { passive: false });
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    mouseX = (e.touches[0].clientX - r.left) * (W / r.width);
    useMouse = true;
    handleAction();
}, { passive: false });

function handleAction() {
    if (state === 'title') startGame();
    else if (state === 'playing' && balls.length > 0 && !balls[0].launched) launchBall(balls[0]);
    else if (state === 'gameover') { state = 'title'; stopBGM(); }
    else if (state === 'waveclear') nextWave();
}

// ==================== BALL HELPERS ====================
function createBall(launched) {
    return {
        x: shield.x,
        y: shield.y - CFG.SHIELD_CURVE - CFG.BALL_R - 2,
        dx: 0, dy: 0,
        r: CFG.BALL_R,
        launched: launched || false
    };
}

function launchBall(b) {
    b.launched = true;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    b.dx = Math.cos(angle) * CFG.BALL_SPEED;
    b.dy = Math.sin(angle) * CFG.BALL_SPEED;
}

function spawnExtraBall() {
    if (balls.length >= CFG.BALL_MAX) return;
    const b = createBall(true);
    b.x = shield.x;
    b.y = shield.y - CFG.SHIELD_CURVE - CFG.BALL_R - 5;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
    b.dx = Math.cos(angle) * CFG.BALL_SPEED;
    b.dy = Math.sin(angle) * CFG.BALL_SPEED;
    balls.push(b);
    spawn_particles(b.x, b.y, '#00ffff', 12);
}

// ==================== MULTIPLIER ====================
function addMult() {
    mult = Math.min(CFG.MULT_MAX, mult + CFG.MULT_HIT_GAIN);
    multDecayTimer = CFG.MULT_DECAY_DELAY;
    if (mult >= 2.0) multFlash = 6;
}

function resetMult() {
    mult = 1.0;
    multDecayTimer = 0;
    multFlash = 12;
}

function getScore(base) {
    return Math.floor(base * mult);
}

// ==================== INIT ====================
function initStars() {
    stars = [];
    for (let i = 0; i < CFG.STAR_COUNT; i++) {
        stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            size: Math.random() * 1.8 + 0.4,
            alpha: Math.random() * 0.7 + 0.2,
            twinkle: Math.random() * 0.03 + 0.005
        });
    }
}

function initEnemies() {
    enemies = [];
    const rows = Math.min(10, CFG.ENEMY_BASE_ROWS + Math.floor(wave * 0.8));
    const cols = Math.min(10, CFG.ENEMY_COLS + Math.max(0, Math.floor((wave - 8) / 3)));
    const totalW = cols * (CFG.ENEMY_W + CFG.ENEMY_PAD) - CFG.ENEMY_PAD;
    const sx = (W - totalW) / 2 + CFG.ENEMY_W / 2;

    // Wave5以降、medium敵の割合が増加
    const mediumRows = Math.min(rows, 1 + Math.floor(wave / 4));

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            enemies.push({
                x: sx + c * (CFG.ENEMY_W + CFG.ENEMY_PAD),
                y: CFG.ENEMY_TOP + r * (CFG.ENEMY_H + CFG.ENEMY_PAD),
                w: CFG.ENEMY_W, h: CFG.ENEMY_H,
                type: r < mediumRows ? 'medium' : 'small',
                hp: r < mediumRows ? 2 : 1,
                alive: true,
                shootTimer: Math.floor(Math.random() * CFG.ENEMY_SHOOT_CD),
                damageTick: 0
            });
        }
    }
    enemyDir = 1;
    enemyMoveTimer = 0;
}

function initBlocks() {
    blocks = [];
    const totalW = CFG.BLOCK_COLS * (CFG.BLOCK_W + 4) - 4;
    const sx = (W - totalW) / 2 + CFG.BLOCK_W / 2;

    for (let r = 0; r < CFG.BLOCK_ROWS; r++) {
        for (let c = 0; c < CFG.BLOCK_COLS; c++) {
            blocks.push({
                x: sx + c * (CFG.BLOCK_W + 4),
                y: CFG.BLOCK_TOP + r * (CFG.BLOCK_H + 4),
                w: CFG.BLOCK_W, h: CFG.BLOCK_H,
                type: Math.random() < CFG.BLOCK_INDESTRUCTIBLE_RATIO ? 'indestructible' : 'breakable',
                alive: true
            });
        }
    }
}

function initShip() {
    ship.x = W / 2;
    ship.hp = CFG.SHIP_HP + Math.floor(wave / 2);
    ship.maxHp = ship.hp;
    ship.dir = 1;
    ship.changeTimer = 60;
}

function startGame() {
    state = 'playing';
    score = 0;
    wave = 1;
    mult = 1.0;
    multDecayTimer = 0;
    killsSinceLastBall = 0;
    initWave();
    playSound('se_start');
    playSound('bgm_main');
}

function initWave() {
    initEnemies();
    initBlocks();
    initShip();
    shield.x = W / 2;
    balls = [createBall(false)];
    bullets = [];
    particles = [];
    killsSinceLastBall = 0;
}

function nextWave() {
    wave++;
    initWave();
    state = 'playing';
}

// ==================== UPDATE ====================
function update() {
    frame++;
    if (screenFlash > 0) screenFlash--;
    if (multFlash > 0) multFlash--;
    if (state !== 'playing') return;

    updateShield();
    updateBalls();
    updateShip();
    updateEnemies();
    updateBullets();
    updateParticles();
    updateMultDecay();
    // 死んだ敵を定期的に掃除（パフォーマンス）
    if (frame % 120 === 0) enemies = enemies.filter(e => e.alive);
    checkCollisions();
    checkWinLose();
}

function updateShield() {
    if (useMouse) {
        shield.x += (mouseX - shield.x) * 0.18;
    } else {
        if (keys['ArrowLeft'] || keys['a']) shield.x -= CFG.SHIELD_SPEED;
        if (keys['ArrowRight'] || keys['d']) shield.x += CFG.SHIELD_SPEED;
    }
    shield.x = Math.max(shield.w / 2, Math.min(W - shield.w / 2, shield.x));

    balls.forEach(b => {
        if (!b.launched) {
            b.x = shield.x;
            b.y = shield.y - CFG.SHIELD_CURVE - b.r - 2;
        }
    });
}

function updateBalls() {
    const toRemove = [];

    balls.forEach((b, i) => {
        if (!b.launched) return;

        b.x += b.dx;
        b.y += b.dy;

        if (b.x - b.r <= 0) { b.x = b.r; b.dx = Math.abs(b.dx); }
        if (b.x + b.r >= W) { b.x = W - b.r; b.dx = -Math.abs(b.dx); }
        if (b.y - b.r <= 0) { b.y = b.r; b.dy = Math.abs(b.dy); }

        if (Math.abs(b.dy) < CFG.BALL_MIN_DY) {
            b.dy = b.dy >= 0 ? CFG.BALL_MIN_DY : -CFG.BALL_MIN_DY;
        }

        if (b.y - b.r > H) {
            toRemove.push(i);
        }
    });

    for (let i = toRemove.length - 1; i >= 0; i--) {
        balls.splice(toRemove[i], 1);
    }

    if (toRemove.length > 0) {
        onBallDrop();
    }
}

function onBallDrop() {
    resetMult();
    playSound('se_ball_drop');

    // ボール1個落とすごとに敵2〜3体増殖
    const aliveCount = enemies.filter(e => e.alive).length;
    const dropSpawn = 2 + Math.floor(Math.random() * 2); // 2〜3体
    const spawnCount = Math.min(dropSpawn, CFG.ENEMY_MAX - aliveCount);
    for (let i = 0; i < spawnCount; i++) {
        enemies.push({
            x: CFG.ENEMY_W / 2 + 20 + Math.random() * (W - CFG.ENEMY_W - 40),
            y: 20 + Math.random() * 30,
            w: CFG.ENEMY_W, h: CFG.ENEMY_H,
            type: 'small', hp: 1, alive: true,
            shootTimer: Math.floor(Math.random() * CFG.ENEMY_SHOOT_CD),
            damageTick: 0
        });
    }

    if (balls.length === 0) {
        // 全ボール落下 → 追加で5体ボーナスペナルティ
        const extraCount = Math.min(5, CFG.ENEMY_MAX - enemies.filter(e => e.alive).length);
        for (let i = 0; i < extraCount; i++) {
            enemies.push({
                x: CFG.ENEMY_W / 2 + 20 + Math.random() * (W - CFG.ENEMY_W - 40),
                y: 20 + Math.random() * 30,
                w: CFG.ENEMY_W, h: CFG.ENEMY_H,
                type: 'small', hp: 1, alive: true,
                shootTimer: Math.floor(Math.random() * CFG.ENEMY_SHOOT_CD),
                damageTick: 0
            });
        }
        spawn_particles(W / 2, H - 20, '#ff4444', 20);
        screenFlash = 12;
        balls = [createBall(false)];
    }
}

function updateMultDecay() {
    if (multDecayTimer > 0) {
        multDecayTimer--;
    } else {
        if (mult > 1.0) {
            mult = Math.max(1.0, mult - CFG.MULT_DECAY_RATE);
        }
    }
}

function updateShip() {
    ship.changeTimer--;
    if (ship.changeTimer <= 0) {
        ship.dir = Math.random() > 0.5 ? 1 : -1;
        ship.speed = CFG.SHIP_WANDER_SPEED * (0.5 + Math.random());
        ship.changeTimer = 30 + Math.floor(Math.random() * 90);
    }
    ship.x += ship.dir * ship.speed;
    ship.x = Math.max(ship.w / 2, Math.min(W - ship.w / 2, ship.x));
    if (ship.x <= ship.w / 2 || ship.x >= W - ship.w / 2) ship.dir *= -1;
}

function updateEnemies() {
    const alive = enemies.filter(e => e.alive);
    if (alive.length === 0) return;

    enemyMoveTimer++;
    if (enemyMoveTimer >= 2) {
        enemyMoveTimer = 0;
        const speed = CFG.ENEMY_HSPEED + wave * 0.08;
        let hitEdge = false;

        alive.forEach(e => {
            e.x += enemyDir * speed;
            if (e.x - e.w / 2 < 10 || e.x + e.w / 2 > W - 10) hitEdge = true;
        });

        if (hitEdge) {
            enemyDir *= -1;
            alive.forEach(e => { e.y += CFG.ENEMY_DROP; });
        }

        // 敵がブロックに重なったらブロック破壊
        alive.forEach(e => {
            blocks.forEach(b => {
                if (!b.alive) return;
                if (Math.abs(e.x - b.x) < (e.w + b.w) / 2 &&
                    Math.abs(e.y - b.y) < (e.h + b.h) / 2) {
                    b.alive = false;
                    spawn_particles(b.x, b.y, '#ff6633', 4);
                }
            });
        });
    }

    alive.forEach(e => {
        if (e.damageTick > 0) e.damageTick--;
        e.shootTimer--;
        if (e.shootTimer <= 0) {
            e.shootTimer = CFG.ENEMY_SHOOT_CD - Math.min(50, wave * 5) + Math.floor(Math.random() * 40);
            const fireChance = Math.min(0.4, 0.12 + wave * 0.02);
            if (Math.random() < fireChance) {
                bullets.push({
                    x: e.x, y: e.y + e.h / 2,
                    w: 4, h: 12, dy: CFG.ENEMY_BULLET_SPEED + wave * 0.1
                });
                playSound('se_enemy_shot');
            }
        }
    });
}

function updateBullets() {
    bullets.forEach(b => { b.y += b.dy; });
    bullets = bullets.filter(b => b.y < H + 20);
}

// ==================== PARTICLES ====================
function spawn_particles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 3;
        particles.push({
            x, y,
            dx: Math.cos(ang) * spd,
            dy: Math.sin(ang) * spd,
            life: 25 + Math.random() * 20,
            maxLife: 45,
            color,
            size: 1.5 + Math.random() * 3
        });
    }
}

function updateParticles() {
    particles.forEach(p => {
        p.x += p.dx;
        p.y += p.dy;
        p.dy += 0.04;
        p.life--;
    });
    particles = particles.filter(p => p.life > 0);
}

// ==================== COLLISION ====================
function checkCollisions() {
    balls.forEach(b => {
        if (!b.launched) return;
        collide_ball_shield(b);
        collide_ball_blocks(b);
        collide_ball_enemies(b);
    });
    collide_bullets_shield();
    collide_bullets_blocks();
    collide_bullets_ship();
}

function collide_ball_shield(ball) {
    if (ball.dy <= 0) return;

    const sl = shield.x - shield.w / 2;
    const st = shield.y - CFG.SHIELD_CURVE;
    const sw = shield.w;
    const sh = CFG.SHIELD_CURVE + shield.h;

    if (ball.x + ball.r > sl && ball.x - ball.r < sl + sw &&
        ball.y + ball.r > st && ball.y - ball.r < st + sh) {

        const hitPos = (ball.x - shield.x) / (shield.w / 2);
        const clamped = Math.max(-1, Math.min(1, hitPos));
        const maxAngle = Math.PI * 0.38;
        const angle = -Math.PI / 2 + clamped * maxAngle;
        const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);

        ball.dx = Math.cos(angle) * speed;
        ball.dy = Math.sin(angle) * speed;
        if (ball.dy > 0) ball.dy = -ball.dy;
        ball.y = st - ball.r;

        spawn_particles(ball.x, ball.y + ball.r, '#00ffff', 5);
        playSound('se_reflect');
    }
}

function collide_ball_blocks(ball) {
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (!b.alive) continue;

        const bl = b.x - b.w / 2;
        const bt = b.y - b.h / 2;

        if (ball.x + ball.r > bl && ball.x - ball.r < bl + b.w &&
            ball.y + ball.r > bt && ball.y - ball.r < bt + b.h) {

            const oL = (ball.x + ball.r) - bl;
            const oR = (bl + b.w) - (ball.x - ball.r);
            const oT = (ball.y + ball.r) - bt;
            const oB = (bt + b.h) - (ball.y - ball.r);
            const min = Math.min(oL, oR, oT, oB);

            // 反射＋押し出し
            if (min === oT) { ball.dy = -Math.abs(ball.dy); ball.y = bt - ball.r; }
            else if (min === oB) { ball.dy = Math.abs(ball.dy); ball.y = bt + b.h + ball.r; }
            else if (min === oL) { ball.dx = -Math.abs(ball.dx); ball.x = bl - ball.r; }
            else { ball.dx = Math.abs(ball.dx); ball.x = bl + b.w + ball.r; }

            if (b.type === 'breakable') {
                b.alive = false;
                score += getScore(10);
                addMult();
                spawn_particles(b.x, b.y, '#ff8844', 8);
                playSound('se_block_break');
            } else {
                spawn_particles(b.x, b.y, '#888888', 3);
                playSound('se_block_hit');
            }
            break;
        }
    }
}

function collide_ball_enemies(ball) {
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.alive) continue;

        const el = e.x - e.w / 2;
        const et = e.y - e.h / 2;

        if (ball.x + ball.r > el && ball.x - ball.r < el + e.w &&
            ball.y + ball.r > et && ball.y - ball.r < et + e.h) {

            const oL = (ball.x + ball.r) - el;
            const oR = (el + e.w) - (ball.x - ball.r);
            const oT = (ball.y + ball.r) - et;
            const oB = (et + e.h) - (ball.y - ball.r);
            const min = Math.min(oL, oR, oT, oB);

            if (min === oT) { ball.dy = -Math.abs(ball.dy); ball.y = et - ball.r; }
            else if (min === oB) { ball.dy = Math.abs(ball.dy); ball.y = et + e.h + ball.r; }
            else if (min === oL) { ball.dx = -Math.abs(ball.dx); ball.x = el - ball.r; }
            else { ball.dx = Math.abs(ball.dx); ball.x = el + e.w + ball.r; }

            e.hp--;
            e.damageTick = 15;
            addMult();

            if (e.hp <= 0) {
                e.alive = false;
                score += getScore(e.type === 'medium' ? 50 : 25);
                spawn_particles(e.x, e.y, e.type === 'medium' ? '#cc44ff' : '#ff4444', 12);
                playSound('se_enemy_hit');

                killsSinceLastBall++;
                if (killsSinceLastBall >= CFG.MULTI_BALL_KILLS) {
                    if (Math.random() < CFG.MULTI_BALL_CHANCE) {
                        spawnExtraBall();
                    }
                    killsSinceLastBall = 0;
                }
            } else {
                spawn_particles(e.x, e.y, '#ffff00', 5);
            }
            break;
        }
    }
}

function collide_bullets_shield() {
    const sl = shield.x - shield.w / 2;
    const st = shield.y - CFG.SHIELD_CURVE;
    const sw = shield.w;
    const sh = CFG.SHIELD_CURVE + shield.h;

    bullets = bullets.filter(b => {
        if (b.x + b.w / 2 > sl && b.x - b.w / 2 < sl + sw &&
            b.y + b.h > st && b.y < st + sh) {
            spawn_particles(b.x, b.y, '#00aaff', 3);
            return false;
        }
        return true;
    });
}

function collide_bullets_blocks() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bu = bullets[i];
        for (let j = 0; j < blocks.length; j++) {
            const bl = blocks[j];
            if (!bl.alive) continue;

            const bll = bl.x - bl.w / 2;
            const blt = bl.y - bl.h / 2;

            if (bu.x + bu.w / 2 > bll && bu.x - bu.w / 2 < bll + bl.w &&
                bu.y + bu.h > blt && bu.y < blt + bl.h) {

                if (bl.type === 'breakable') {
                    bl.alive = false;
                    spawn_particles(bl.x, bl.y, '#ff6633', 5);
                }
                bullets.splice(i, 1);
                break;
            }
        }
    }
}

function collide_bullets_ship() {
    const sl = ship.x - ship.w / 2;
    const st = H - CFG.SHIP_VIS_H;

    bullets = bullets.filter(b => {
        if (b.x + b.w / 2 > sl && b.x - b.w / 2 < sl + ship.w &&
            b.y + b.h > st) {
            ship.hp--;
            screenFlash = 8;
            spawn_particles(b.x, b.y, '#ff0000', 10);
            playSound('se_ship_damage');
            return false;
        }
        return true;
    });
}

// ==================== WIN / LOSE ====================
function checkWinLose() {
    if (ship.hp <= 0) {
        state = 'gameover';
        stopBGM();
        playSound('se_gameover');
        return;
    }

    const alive = enemies.filter(e => e.alive);
    for (const e of alive) {
        if (e.y + e.h / 2 >= shield.y - 30) {
            state = 'gameover';
            stopBGM();
            playSound('se_gameover');
            return;
        }
    }

    if (alive.length === 0) {
        state = 'waveclear';
        score += wave * 100;
        playSound(wave % 5 === 0 ? 'se_wave_clear_special' : 'se_wave_clear');
    }
}

// ==================== RENDER ====================
function draw() {
    ctx.fillStyle = '#000811';
    ctx.fillRect(0, 0, W, H);
    drawStars();

    if (state === 'loading') {
        drawText('LOADING...', W / 2, H / 2, 24, '#ffffff');
        return;
    }
    if (state === 'title') { drawTitle(); return; }

    drawLoseLine();
    drawBlocks();
    drawEnemies();
    drawBullets();
    drawShield();
    drawBalls();
    drawShip();
    drawParticlesLayer();
    drawHUD();
    drawMultGauge();

    if (screenFlash > 0) {
        ctx.fillStyle = `rgba(255, 50, 50, ${screenFlash * 0.03})`;
        ctx.fillRect(0, 0, W, H);
    }

    if (state === 'waveclear') drawWaveClear();
    if (state === 'gameover') drawGameOver();

    if (balls.length > 0 && !balls[0].launched && state === 'playing') {
        const a = Math.sin(frame * 0.06) * 0.3 + 0.7;
        drawText('CLICK / SPACE でボール発射', W / 2, H / 2 + 60, 16, `rgba(255,255,255,${a})`);
    }
}

function drawStars() {
    stars.forEach(s => {
        const a = s.alpha * (0.5 + 0.5 * Math.sin(frame * s.twinkle));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawShield() {
    const x = shield.x - shield.w / 2;
    const y = shield.y;

    ctx.save();
    ctx.shadowColor = '#00ddff';
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.moveTo(x, y + shield.h);
    ctx.lineTo(x, y);
    ctx.quadraticCurveTo(shield.x, y - CFG.SHIELD_CURVE * 2, x + shield.w, y);
    ctx.lineTo(x + shield.w, y + shield.h);
    ctx.quadraticCurveTo(shield.x, y + shield.h - CFG.SHIELD_CURVE * 0.5, x, y + shield.h);
    ctx.closePath();

    const g = ctx.createLinearGradient(x, y - CFG.SHIELD_CURVE, x, y + shield.h);
    g.addColorStop(0, 'rgba(0,240,255,0.95)');
    g.addColorStop(0.4, 'rgba(0,140,255,0.85)');
    g.addColorStop(1, 'rgba(0,60,140,0.7)');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

function drawBalls() {
    const img = IMG.ball;
    balls.forEach(b => {
        ctx.save();
        ctx.shadowColor = '#00eeff';
        ctx.shadowBlur = 16;

        if (img && img.complete && img.naturalWidth > 0) {
            const s = b.r * 3.2;
            ctx.drawImage(img, b.x - s / 2, b.y - s / 2, s, s);
        } else {
            ctx.fillStyle = '#00ffff';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    });
}

function drawEnemies() {
    enemies.forEach(e => {
        if (!e.alive) return;
        const img = e.type === 'medium' ? IMG.enemy_medium : IMG.enemy_small;

        ctx.save();

        // 被弾フラッシュ（白点滅）
        if (e.damageTick > 0) {
            if (e.damageTick % 4 < 2) { ctx.restore(); return; } // 点滅で消える
        }

        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
        } else {
            ctx.fillStyle = e.type === 'medium' ? '#aa44ff' : '#ff3333';
            ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
        }

        ctx.restore();
    });
}

function drawLoseLine() {
    const ly = shield.y - 30;
    const a = 0.5 + Math.sin(frame * 0.04) * 0.15;

    ctx.save();
    // グロー
    ctx.shadowColor = 'rgba(255, 40, 40, 0.6)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = `rgba(255, 60, 60, ${a})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 10]);
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(W, ly);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255, 80, 80, ${a + 0.1})`;
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼ DANGER LINE', 8, ly - 10);
    ctx.textAlign = 'right';
    ctx.fillText('DANGER LINE ▼', W - 8, ly - 10);
    ctx.restore();
}

function drawBlocks() {
    blocks.forEach(b => {
        if (!b.alive) return;
        const img = b.type === 'indestructible' ? IMG.block_unbreakable : IMG.block_breakable;
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        } else {
            ctx.fillStyle = b.type === 'indestructible' ? '#555555' : '#884422';
            ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        }
    });
}

function drawShip() {
    const sy = H - CFG.SHIP_VIS_H;
    const img = IMG.ship_up;

    ctx.save();
    if (img) {
        const scale = ship.w / img.width;
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, ship.x - dw / 2, sy, dw, dh);
    } else {
        ctx.fillStyle = '#223388';
        ctx.fillRect(ship.x - ship.w / 2, sy, ship.w, CFG.SHIP_VIS_H + 20);
    }

    const bw = ship.w * 0.7;
    const bh = 5;
    const bx = ship.x - bw / 2;
    const by = sy - 10;

    ctx.fillStyle = '#222222';
    ctx.fillRect(bx, by, bw, bh);

    const ratio = ship.hp / ship.maxHp;
    ctx.fillStyle = ratio > 0.5 ? '#00ff88' : ratio > 0.25 ? '#ffaa00' : '#ff3333';
    ctx.fillRect(bx, by, bw * ratio, bh);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);

    if (ship.hp < ship.maxHp && ship.hp > 0 && frame % 40 < 4) {
        ctx.fillStyle = 'rgba(255,0,0,0.15)';
        ctx.fillRect(ship.x - ship.w / 2, sy, ship.w, CFG.SHIP_VIS_H);
    }
    ctx.restore();
}

function drawBullets() {
    ctx.save();
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ff5533';
    bullets.forEach(b => {
        ctx.fillRect(b.x - b.w / 2, b.y, b.w, b.h);
    });
    ctx.restore();
}

function drawParticlesLayer() {
    particles.forEach(p => {
        const a = p.life / p.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

function drawHUD() {
    drawText('SCORE  ' + String(score).padStart(7, '0'), 12, 26, 18, '#ffffff', 'left');
    drawText('WAVE ' + wave, W - 12, 26, 18, '#00ccff', 'right');

    const hpTxt = 'HP ' + ship.hp + '/' + ship.maxHp;
    const hpCol = ship.hp / ship.maxHp > 0.5 ? '#00ff88' : ship.hp / ship.maxHp > 0.25 ? '#ffaa00' : '#ff3333';
    drawText(hpTxt, W / 2, 26, 15, hpCol, 'center');

    if (balls.length > 1) {
        drawText('BALL x' + balls.length, W - 12, 48, 13, '#00ffaa', 'right');
    }
}

function drawMultGauge() {
    const gw = 180;
    const gh = 10;
    const gx = W / 2 - gw / 2;
    const gy = H - 18;
    const ratio = (mult - 1.0) / (CFG.MULT_MAX - 1.0);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(gx, gy, gw, gh);

    let color;
    if (mult >= 4.0) color = '#ff2200';
    else if (mult >= 3.0) color = '#ff8800';
    else if (mult >= 2.0) color = '#ffdd00';
    else color = '#00ccff';

    ctx.fillStyle = color;
    ctx.fillRect(gx, gy, gw * ratio, gh);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);

    const multTxt = 'x' + mult.toFixed(1);
    const txtCol = multFlash > 0 && multFlash % 2 === 0 ? '#ff0000' : color;

    ctx.save();
    if (mult >= 3.0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
    }
    drawText(multTxt, W / 2, gy - 6, 15, txtCol, 'center');
    ctx.restore();
}

function drawText(text, x, y, size, color, align) {
    ctx.save();
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
}

// ==================== SCREENS ====================
function drawTitle() {
    ctx.save();
    ctx.shadowColor = '#00ddff';
    ctx.shadowBlur = 30;
    drawText('SHIELD', W / 2, H / 2 - 100, 56, '#00eeff');
    drawText('BREAKER', W / 2, H / 2 - 40, 56, '#0088ff');
    ctx.restore();

    drawText('〜 局地シールド防衛戦 〜', W / 2, H / 2 + 20, 16, '#777777');

    const a = Math.sin(frame * 0.06) * 0.4 + 0.6;
    drawText('CLICK / SPACE でスタート', W / 2, H / 2 + 80, 18, `rgba(255,255,255,${a})`);

    drawText('← → / マウス  シールド移動', W / 2, H / 2 + 150, 13, '#555555');
    drawText('SPACE / クリック  ボール発射', W / 2, H / 2 + 172, 13, '#555555');

    ctx.save();
    ctx.shadowColor = '#00ddff';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2 + 250, 60, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
}

function drawWaveClear() {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 25;
    drawText('WAVE ' + wave + ' CLEAR!', W / 2, H / 2 - 30, 38, '#00ff88');
    ctx.restore();

    drawText('BONUS +' + (wave * 100), W / 2, H / 2 + 15, 20, '#ffdd00');

    const a = Math.sin(frame * 0.06) * 0.4 + 0.6;
    drawText('CLICK / SPACE で次のウェーブへ', W / 2, H / 2 + 65, 16, `rgba(255,255,255,${a})`);
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur = 25;
    drawText('GAME OVER', W / 2, H / 2 - 50, 46, '#ff4444');
    ctx.restore();

    drawText('SCORE  ' + String(score).padStart(7, '0'), W / 2, H / 2 + 10, 26, '#ffffff');
    drawText('WAVE  ' + wave, W / 2, H / 2 + 45, 18, '#888888');

    const a = Math.sin(frame * 0.06) * 0.4 + 0.6;
    drawText('CLICK / SPACE でタイトルへ', W / 2, H / 2 + 100, 16, `rgba(255,255,255,${a})`);
}

// ==================== MAIN LOOP ====================
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// ==================== RESPONSIVE ====================
function resizeCanvas() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gameRatio = W / H; // 0.75
    const screenRatio = vw / vh;

    let cw, ch;
    if (screenRatio > gameRatio) {
        ch = vh;
        cw = vh * gameRatio;
    } else {
        cw = vw;
        ch = vw / gameRatio;
    }

    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => {
    setTimeout(resizeCanvas, 100);
});

// ==================== 起動 ====================
function init() {
    resizeCanvas();
    initStars();
    loadSounds();
    loadImages(() => {
        prepareShipSprite();
        state = 'title';
    });
    requestAnimationFrame(loop);
}

init();
})();