/**
 * サラリーマン落としゲーム
 * スイカゲーム風の落ち物パズル
 */

// ============================================
// 定数定義
// ============================================
const CHARACTER_DATA = [
    { id: 0, name: 'intern',     nameJp: 'インターン', file: '01_intern.png',     baseRadius: 20,  score: 1000 },
    { id: 1, name: 'newgrad',    nameJp: '新卒',       file: '02_newgrad.png',    baseRadius: 28,  score: 3000 },
    { id: 2, name: 'employee',   nameJp: '平社員',     file: '03_employee.png',   baseRadius: 36,  score: 5000 },
    { id: 3, name: 'supervisor', nameJp: '主任',       file: '04_supervisor.png', baseRadius: 44,  score: 8000 },
    { id: 4, name: 'chief',      nameJp: '係長',       file: '05_chief.png',      baseRadius: 52,  score: 12000 },
    { id: 5, name: 'manager',    nameJp: '課長',       file: '06_manager.png',    baseRadius: 60,  score: 18000 },
    { id: 6, name: 'director',   nameJp: '部長',       file: '07_director.png',   baseRadius: 70,  score: 26000 },
    { id: 7, name: 'executive',  nameJp: '役員',       file: '08_executive.png',  baseRadius: 80,  score: 36000 },
    { id: 8, name: 'president',  nameJp: '社長',       file: '09_president.png',  baseRadius: 92,  score: 50000 },
    { id: 9, name: 'chairman',   nameJp: '会長',       file: '10_chairman.png',   baseRadius: 105, score: 100000 }
];

// 落下で出現するキャラクターの最大レベル（0-4: インターン〜係長）
const MAX_DROP_LEVEL = 4;

// ゲームオーバーラインの位置（上からの距離）
const GAMEOVER_LINE_RATIO = 0.1;

// ゲームオーバー判定の猶予時間（ミリ秒）
const GAMEOVER_GRACE_PERIOD = 2000;

// 音声ファイルパス
const SOUND_FILES = {
    bgm: 'assets/sounds/bgm.mp3',
    drop: 'assets/sounds/se_drop.mp3',
    land: 'assets/sounds/se_land.mp3',
    merge: 'assets/sounds/se_merge.mp3',
    bonus: 'assets/sounds/se_bonus.mp3',
    gameover: 'assets/sounds/se_gameover.mp3'
};

// ============================================
// ゲームクラス
// ============================================
class SalarymanGame {
    constructor() {
        // Matter.js モジュール
        this.Engine = Matter.Engine;
        this.Render = Matter.Render;
        this.Runner = Matter.Runner;
        this.Bodies = Matter.Bodies;
        this.Body = Matter.Body;
        this.Composite = Matter.Composite;
        this.Events = Matter.Events;
        this.Mouse = Matter.Mouse;
        
        // ゲーム状態
        this.score = 0;
        this.isGameOver = false;
        this.canDrop = true;
        this.currentCharacter = null;
        this.nextCharacterLevel = 0;
        this.scoreMultiplier = 1;
        
        // 画像キャッシュ
        this.images = {};
        this.backgroundImage = null;
        
        // ゲームエリア設定
        this.gameArea = {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };
        
        // 合体処理用のペアを追跡
        this.mergePairs = new Set();
        
        // ゲームオーバー判定用
        this.overLineTimers = new Map();
        
        // 音声
        this.sounds = {};
        this.bgm = null;
        this.isBgmPlaying = false;

        // 社畜イベント管理
        this.mergeTimestamps = [];
        this.lastMergeTime = Date.now();
        this.eventState = null;
        this.eventEndTime = 0;
        this.toastTimeout = null;
        
        // 初期化
        this.init();
    }
    
    // ============================================
    // 初期化
    // ============================================
    async init() {
        // 画像を先に読み込み
        await this.loadImages();
        
        // 音声を読み込み
        this.loadSounds();
        
        // Canvas設定
        this.setupCanvas();
        
        // Matter.js初期化
        this.setupPhysics();
        
        // 壁作成
        this.createWalls();
        
        // イベント設定
        this.setupEvents();
        
        // 最初のキャラクター準備
        this.nextCharacterLevel = this.getRandomDropLevel();
        this.prepareNextCharacter();

        // 朝礼イベントで通知を表示
        this.triggerMorningBriefing();
        
        // 進化表を生成
        this.createEvolutionChart();
        
        // ゲームループ開始
        this.gameLoop();
    }
    
    // 画像読み込み
    async loadImages() {
        const loadImage = (src) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });
        };
        
        // キャラクター画像
        for (const char of CHARACTER_DATA) {
            this.images[char.id] = await loadImage(`assets/characters/${char.file}`);
        }
        
        // 背景画像
        this.backgroundImage = await loadImage('assets/background.png');
    }
    
    // 音声読み込み
    loadSounds() {
        // SE
        for (const [key, path] of Object.entries(SOUND_FILES)) {
            if (key === 'bgm') continue;
            const audio = new Audio(path);
            audio.volume = 0.4;
            this.sounds[key] = audio;
        }
        
        // BGM
        this.bgm = new Audio(SOUND_FILES.bgm);
        this.bgm.loop = true;
        this.bgm.volume = 0.3;
    }
    
    // SE再生
    playSound(name) {
        const sound = this.sounds[name];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(() => {});
        }
    }
    
    // BGM開始
    startBgm() {
        if (!this.isBgmPlaying && this.bgm) {
            this.bgm.play().catch(() => {});
            this.isBgmPlaying = true;
        }
    }
    
    // BGM停止
    stopBgm() {
        if (this.bgm) {
            this.bgm.pause();
            this.bgm.currentTime = 0;
            this.isBgmPlaying = false;
        }
    }
    
    // Canvas設定
    setupCanvas() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 画面サイズに合わせる
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    // リサイズ処理
    resizeCanvas() {
        const container = document.getElementById('game-container');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // アスペクト比を維持（9:16）
        const targetRatio = 9 / 16;
        let canvasWidth, canvasHeight;
        
        if (containerWidth / containerHeight > targetRatio) {
            canvasHeight = containerHeight;
            canvasWidth = canvasHeight * targetRatio;
        } else {
            canvasWidth = containerWidth;
            canvasHeight = canvasWidth / targetRatio;
        }
        
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        
        // ゲームエリア計算（ビルの位置に合わせる）
        // 背景画像に合わせた調整
        const marginX = canvasWidth * 0.15;
        const marginTop = canvasHeight * 0.20;
        const marginBottom = canvasHeight * 0.05;
        
        this.gameArea = {
            x: marginX,
            y: marginTop,
            width: canvasWidth - marginX * 2,
            height: canvasHeight - marginTop - marginBottom
        };
        
        // ゲームオーバーライン
        this.gameOverLineY = this.gameArea.y + this.gameArea.height * GAMEOVER_LINE_RATIO;
        
        // 壁を再作成
        if (this.engine) {
            this.createWalls();
        }
    }
    
    // ============================================
    // 物理エンジン設定
    // ============================================
    setupPhysics() {
        // エンジン作成
        this.engine = this.Engine.create();
        this.world = this.engine.world;
        
        // 重力設定
        this.normalGravity = 1.5;
        this.engine.world.gravity.y = this.normalGravity;
        
        // ランナー作成
        this.runner = this.Runner.create();
        this.Runner.run(this.runner, this.engine);
        
        // 衝突イベント
        this.Events.on(this.engine, 'collisionStart', (event) => this.handleCollision(event));
    }
    
    // 壁作成
    createWalls() {
        // 既存の壁を削除
        const bodies = this.Composite.allBodies(this.world);
        for (const body of bodies) {
            if (body.label === 'wall') {
                this.Composite.remove(this.world, body);
            }
        }
        
        const { x, y, width, height } = this.gameArea;
        const wallThickness = 20;
        
        // 壁オプション
        const wallOptions = {
            isStatic: true,
            label: 'wall',
            friction: 0.1,
            restitution: 0.2
        };
        
        // 左壁
        const leftWall = this.Bodies.rectangle(
            x - wallThickness / 2,
            y + height / 2,
            wallThickness,
            height,
            wallOptions
        );
        
        // 右壁
        const rightWall = this.Bodies.rectangle(
            x + width + wallThickness / 2,
            y + height / 2,
            wallThickness,
            height,
            wallOptions
        );
        
        // 床
        const floor = this.Bodies.rectangle(
            x + width / 2,
            y + height + wallThickness / 2,
            width + wallThickness * 2,
            wallThickness,
            wallOptions
        );
        
        this.Composite.add(this.world, [leftWall, rightWall, floor]);
    }
    
    // ============================================
    // イベント設定
    // ============================================
    setupEvents() {
        const canvas = this.canvas;
        
        // マウス/タッチ位置取得
        const getPointerX = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            return (clientX - rect.left) * (canvas.width / rect.width);
        };
        
        // マウス移動
        canvas.addEventListener('mousemove', (e) => {
            if (this.currentCharacter && this.canDrop) {
                this.updateCharacterPosition(getPointerX(e));
            }
        });
        
        // タッチ移動
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.currentCharacter && this.canDrop) {
                this.updateCharacterPosition(getPointerX(e));
            }
        }, { passive: false });
        
        // クリック/タップで落下
        canvas.addEventListener('click', (e) => {
            this.startBgm();
            if (this.canDrop && this.currentCharacter) {
                this.dropCharacter();
            }
        });
        
        canvas.addEventListener('touchend', (e) => {
            this.startBgm();
            if (this.canDrop && this.currentCharacter) {
                this.dropCharacter();
            }
        });
        
        // リスタートボタン
        document.getElementById('restart-button').addEventListener('click', () => {
            this.restart();
        });
    }
    
    // キャラクター位置更新
    updateCharacterPosition(x) {
        const char = CHARACTER_DATA[this.currentCharacter.level];
        const minX = this.gameArea.x + char.baseRadius;
        const maxX = this.gameArea.x + this.gameArea.width - char.baseRadius;
        
        this.currentCharacter.x = Math.max(minX, Math.min(maxX, x));
    }
    
    // ============================================
    // キャラクター管理
    // ============================================
    getRandomDropLevel() {
        return Math.floor(Math.random() * (MAX_DROP_LEVEL + 1));
    }
    
    prepareNextCharacter() {
        const level = this.nextCharacterLevel;
        const char = CHARACTER_DATA[level];
        
        this.currentCharacter = {
            level: level,
            x: this.gameArea.x + this.gameArea.width / 2,
            y: this.gameArea.y - char.baseRadius - 10
        };
        
        // 次のキャラクターを決定
        this.nextCharacterLevel = this.getRandomDropLevel();
        this.updateNextDisplay();
        
        this.canDrop = true;
    }
    
    updateNextDisplay() {
        const nextChar = CHARACTER_DATA[this.nextCharacterLevel];
        const nextDisplay = document.getElementById('next-character');
        nextDisplay.innerHTML = `<img src="assets/characters/${nextChar.file}" alt="${nextChar.nameJp}">`;
    }
    
    dropCharacter() {
        if (!this.canDrop || !this.currentCharacter) return;
        
        this.canDrop = false;
        this.playSound('drop');
        
        const level = this.currentCharacter.level;
        const char = CHARACTER_DATA[level];
        
        // 物理ボディ作成
        const body = this.Bodies.circle(
            this.currentCharacter.x,
            this.currentCharacter.y,
            char.baseRadius,
            {
                label: 'character',
                restitution: 0.3,
                friction: 0.5,
                frictionAir: 0.01,
                density: 0.001
            }
        );
        
        body.characterLevel = level;
        
        this.Composite.add(this.world, body);
        this.currentCharacter = null;
        
        // 一定時間後に次のキャラクター準備
        setTimeout(() => {
            if (!this.isGameOver) {
                this.prepareNextCharacter();
            }
        }, 500);
    }
    
    // ============================================
    // 衝突処理
    // ============================================
    handleCollision(event) {
        const pairs = event.pairs;
        
        for (const pair of pairs) {
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;
            
            // 床との衝突でランド音
            if ((bodyA.label === 'wall' && bodyB.label === 'character') ||
                (bodyB.label === 'wall' && bodyA.label === 'character')) {
                // 速度が一定以上なら音を鳴らす
                const charBody = bodyA.label === 'character' ? bodyA : bodyB;
                const speed = Math.sqrt(charBody.velocity.x ** 2 + charBody.velocity.y ** 2);
                if (speed > 3) {
                    this.playSound('land');
                }
            }
            
            // キャラクター同士の衝突
            if (bodyA.label === 'character' && bodyB.label === 'character') {
                // 同じレベルなら合体
                if (bodyA.characterLevel === bodyB.characterLevel) {
                    const pairKey = [bodyA.id, bodyB.id].sort().join('-');
                    
                    if (!this.mergePairs.has(pairKey)) {
                        this.mergePairs.add(pairKey);
                        this.mergeCharacters(bodyA, bodyB);
                    }
                }
            }
        }
    }
    
    mergeCharacters(bodyA, bodyB) {
        const level = bodyA.characterLevel;
        
        // 会長同士なら消える（ボーナス）
        if (level === CHARACTER_DATA.length - 1) {
            this.Composite.remove(this.world, bodyA);
            this.Composite.remove(this.world, bodyB);
            
            this.addScore(CHARACTER_DATA[level].score * 2);
            this.playSound('bonus');
            
            // エフェクト表示
            const midX = (bodyA.position.x + bodyB.position.x) / 2;
            const midY = (bodyA.position.y + bodyB.position.y) / 2;
            this.showMergeEffect(midX, midY, true);
            return;
        }
        
        // 合体位置
        const newX = (bodyA.position.x + bodyB.position.x) / 2;
        const newY = (bodyA.position.y + bodyB.position.y) / 2;
        
        // 古いボディを削除
        this.Composite.remove(this.world, bodyA);
        this.Composite.remove(this.world, bodyB);
        
        // 新しいキャラクター作成
        const newLevel = level + 1;
        const newChar = CHARACTER_DATA[newLevel];
        
        const newBody = this.Bodies.circle(
            newX,
            newY,
            newChar.baseRadius,
            {
                label: 'character',
                restitution: 0.3,
                friction: 0.5,
                frictionAir: 0.01,
                density: 0.001
            }
        );
        
        newBody.characterLevel = newLevel;
        
        this.Composite.add(this.world, newBody);
        
        // スコア加算
        this.addScore(newChar.score);
        this.playSound('merge');
        
        // エフェクト表示
        this.showMergeEffect(newX, newY, false);

        // 社畜イベント判定
        this.registerMergeEvent(newLevel);
    }

    registerMergeEvent(newLevel) {
        const now = Date.now();
        this.lastMergeTime = now;
        this.mergeTimestamps = this.mergeTimestamps.filter((time) => now - time <= 5000);
        this.mergeTimestamps.push(now);

        if (!this.eventState && this.mergeTimestamps.length >= 3) {
            this.triggerOvertime();
        }

        if (newLevel >= 5 && Math.random() < 0.3) {
            this.spawnRecruit();
        }
    }

    triggerMorningBriefing() {
        this.eventState = 'briefing';
        this.eventEndTime = Date.now() + 6000;
        this.scoreMultiplier = 1.1;
        this.engine.world.gravity.y = 1.2;
        this.showNotification('朝礼スタート！安定落下＆給料1.1倍');
    }

    triggerOvertime() {
        this.eventState = 'overtime';
        this.eventEndTime = Date.now() + 10000;
        this.scoreMultiplier = 1.5;
        this.engine.world.gravity.y = 2.4;
        this.showNotification('残業発動！落下速度UP＆給料1.5倍');
    }

    triggerPaidLeave() {
        this.eventState = 'paidleave';
        this.eventEndTime = Date.now() + 8000;
        this.scoreMultiplier = 1.2;
        this.engine.world.gravity.y = 0.9;
        this.showNotification('有給取得！落下がゆったり＆給料1.2倍');
    }

    endEventIfNeeded() {
        if (!this.eventState) return;
        if (Date.now() < this.eventEndTime) return;
        this.eventState = null;
        this.scoreMultiplier = 1;
        this.engine.world.gravity.y = this.normalGravity;
    }

    spawnRecruit() {
        const level = 0;
        const char = CHARACTER_DATA[level];
        const spawnX = this.gameArea.x + Math.random() * this.gameArea.width;
        const body = this.Bodies.circle(
            spawnX,
            this.gameArea.y - char.baseRadius - 20,
            char.baseRadius,
            {
                label: 'character',
                restitution: 0.3,
                friction: 0.5,
                frictionAir: 0.015,
                density: 0.001
            }
        );
        body.characterLevel = level;
        this.Composite.add(this.world, body);
        this.showNotification('部下スカウト！インターンが入社');
    }
    
    showMergeEffect(x, y, isChairman) {
        // 簡易エフェクト（将来的に改善可能）
        // 現在は描画ループ内で処理
        if (!this.effects) this.effects = [];
        
        this.effects.push({
            x: x,
            y: y,
            radius: 10,
            maxRadius: isChairman ? 100 : 50,
            alpha: 1,
            isChairman: isChairman
        });
    }
    
    // ============================================
    // 進化表生成
    // ============================================
    createEvolutionChart() {
        const chart = document.getElementById('evolution-chart');
        chart.innerHTML = '';
        
        CHARACTER_DATA.forEach((char, index) => {
            const item = document.createElement('div');
            item.className = 'evo-item';
            
            const charDiv = document.createElement('div');
            charDiv.className = 'evo-char';
            charDiv.innerHTML = `<img src="assets/characters/${char.file}" alt="${char.nameJp}" title="${char.nameJp}">`;
            item.appendChild(charDiv);
            
            if (index < CHARACTER_DATA.length - 1) {
                const arrow = document.createElement('span');
                arrow.className = 'evo-arrow';
                arrow.textContent = '→';
                item.appendChild(arrow);
            }
            
            chart.appendChild(item);
        });
    }
    
    // ============================================
    // スコア管理
    // ============================================
    addScore(points) {
        const finalPoints = Math.round(points * this.scoreMultiplier);
        this.score += finalPoints;
        document.getElementById('score').textContent = this.score.toLocaleString();
    }
    
    // ============================================
    // ゲームオーバー判定
    // ============================================
    checkGameOver() {
        const bodies = this.Composite.allBodies(this.world);
        const currentTime = Date.now();
        
        for (const body of bodies) {
            if (body.label !== 'character') continue;
            
            const char = CHARACTER_DATA[body.characterLevel];
            const topY = body.position.y - char.baseRadius;
            
            // ゲームオーバーラインを超えているか
            if (topY < this.gameOverLineY) {
                // 静止しているか（速度が小さいか）
                const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
                
                if (speed < 0.5) {
                    // タイマーがなければ開始
                    if (!this.overLineTimers.has(body.id)) {
                        this.overLineTimers.set(body.id, currentTime);
                    } else {
                        // 猶予時間を超えたらゲームオーバー
                        const startTime = this.overLineTimers.get(body.id);
                        if (currentTime - startTime > GAMEOVER_GRACE_PERIOD) {
                            this.gameOver();
                            return;
                        }
                    }
                } else {
                    // 動いている場合はタイマーリセット
                    this.overLineTimers.delete(body.id);
                }
            } else {
                // ライン以下ならタイマー削除
                this.overLineTimers.delete(body.id);
            }
        }
    }
    
    gameOver() {
        this.isGameOver = true;
        this.canDrop = false;
        
        // BGM停止、ゲームオーバーSE再生
        this.stopBgm();
        this.playSound('gameover');
        
        document.getElementById('final-score').textContent = this.score.toLocaleString();
        document.getElementById('gameover-screen').classList.remove('hidden');
    }
    
    restart() {
        // ワールドをクリア
        this.Composite.clear(this.world);
        
        // 壁を再作成
        this.createWalls();
        
        // 状態リセット
        this.score = 0;
        this.isGameOver = false;
        this.canDrop = true;
        this.currentCharacter = null;
        this.mergePairs.clear();
        this.overLineTimers.clear();
        this.effects = [];
        this.isBgmPlaying = false;
        this.mergeTimestamps = [];
        this.lastMergeTime = Date.now();
        this.eventState = null;
        this.eventEndTime = 0;
        this.scoreMultiplier = 1;
        if (this.engine) {
            this.engine.world.gravity.y = this.normalGravity;
        }
        this.hideNotification();
        
        // UI更新
        document.getElementById('score').textContent = '0';
        document.getElementById('gameover-screen').classList.add('hidden');
        
        // 新しいキャラクター準備
        this.nextCharacterLevel = this.getRandomDropLevel();
        this.prepareNextCharacter();

        // 再スタート時も朝礼イベント
        this.triggerMorningBriefing();
    }
    
    // ============================================
    // 描画
    // ============================================
    gameLoop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }
    
    update() {
        if (!this.isGameOver) {
            this.checkGameOver();
            this.endEventIfNeeded();

            if (!this.eventState && Date.now() - this.lastMergeTime > 12000) {
                this.triggerPaidLeave();
                this.lastMergeTime = Date.now();
            }
        }
        
        // エフェクト更新
        if (this.effects) {
            this.effects = this.effects.filter(effect => {
                effect.radius += 3;
                effect.alpha -= 0.05;
                return effect.alpha > 0;
            });
        }
        
        // 合体ペアをクリア（次のフレーム用）
        this.mergePairs.clear();
    }

    showNotification(message) {
        const toast = document.getElementById('event-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');

        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }

        this.toastTimeout = setTimeout(() => {
            this.hideNotification();
        }, 2500);
    }

    hideNotification() {
        const toast = document.getElementById('event-toast');
        if (!toast) return;
        toast.classList.remove('show');
    }
    
    draw() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        
        // 背景クリア
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 背景画像描画
        if (this.backgroundImage) {
            ctx.drawImage(this.backgroundImage, 0, 0, canvas.width, canvas.height);
        }
        
        // ゲームエリア（半透明の枠）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(this.gameArea.x, this.gameArea.y, this.gameArea.width, this.gameArea.height);
        
        // 枠線（二重線 + グラデーション）
        const { x, y, width, height } = this.gameArea;
        
        // 外枠グラデーション
        const outerGradient = ctx.createLinearGradient(x, y, x + width, y + height);
        outerGradient.addColorStop(0, '#2c3e50');
        outerGradient.addColorStop(0.5, '#34495e');
        outerGradient.addColorStop(1, '#2c3e50');
        
        ctx.strokeStyle = outerGradient;
        ctx.lineWidth = 8;
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
        
        // 内枠グラデーション
        const innerGradient = ctx.createLinearGradient(x, y, x + width, y + height);
        innerGradient.addColorStop(0, '#f39c12');
        innerGradient.addColorStop(0.5, '#f1c40f');
        innerGradient.addColorStop(1, '#f39c12');
        
        ctx.strokeStyle = innerGradient;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3, y + 3, width - 6, height - 6);
        
        // ゲームオーバーライン（デバッグ用、本番では非表示にしても可）
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(this.gameArea.x, this.gameOverLineY);
        ctx.lineTo(this.gameArea.x + this.gameArea.width, this.gameOverLineY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // キャラクター描画
        const bodies = this.Composite.allBodies(this.world);
        for (const body of bodies) {
            if (body.label !== 'character') continue;
            
            const level = body.characterLevel;
            const char = CHARACTER_DATA[level];
            const img = this.images[level];
            
            if (img) {
                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle);
                
                const size = char.baseRadius * 2;
                ctx.drawImage(img, -size / 2, -size / 2, size, size);
                
                ctx.restore();
            }
        }
        
        // 落下前のキャラクター描画
        if (this.currentCharacter && this.canDrop) {
            const level = this.currentCharacter.level;
            const char = CHARACTER_DATA[level];
            const img = this.images[level];
            
            if (img) {
                const size = char.baseRadius * 2;
                
                // ガイドライン
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(this.currentCharacter.x, this.currentCharacter.y);
                ctx.lineTo(this.currentCharacter.x, this.gameArea.y + this.gameArea.height);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // キャラクター
                ctx.drawImage(
                    img,
                    this.currentCharacter.x - size / 2,
                    this.currentCharacter.y - size / 2,
                    size,
                    size
                );
            }
        }
        
        // エフェクト描画
        if (this.effects) {
            for (const effect of this.effects) {
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                
                if (effect.isChairman) {
                    ctx.strokeStyle = `rgba(255, 215, 0, ${effect.alpha})`;
                    ctx.lineWidth = 5;
                } else {
                    ctx.strokeStyle = `rgba(255, 255, 255, ${effect.alpha})`;
                    ctx.lineWidth = 3;
                }
                ctx.stroke();
            }
        }
    }
}

// ============================================
// ゲーム開始
// ============================================
window.addEventListener('load', () => {
    new SalarymanGame();
});
