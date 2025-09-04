// Changes: higher floor line, behind objects, same box speed, speed ramps up

const GAME_WIDTH = 900;
const GAME_HEIGHT = 600;
const DISPLAY_SPRITE_SIZE = 64;

const GROUND_HEIGHT = 120;
const GROUND_LINE_Y = GAME_HEIGHT - GROUND_HEIGHT + 20; // slightly higher floor line

const GRAVITY = 1800;
const JUMP_VELOCITY = -680;

// Box speed handling
let currentBoxSpeed = 280;      // initial speed for all boxes
const SPEED_INCREASE = 8;       // speed increase per second
const MAX_BOX_SPEED = 700;      // cap speed so it doesn't get insane
let BOX_SPAWN_INTERVAL = 1200;
const BOX_FALL_START_Y = -80;

const SCALE = DISPLAY_SPRITE_SIZE / 340;

class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.sprite = scene.add.image(x, y, 'run_1')
      .setDisplaySize(DISPLAY_SPRITE_SIZE, DISPLAY_SPRITE_SIZE)
      .setOrigin(0.5);

    this.vy = 0;
    this.isOnGround = false;
    this.width = DISPLAY_SPRITE_SIZE;
    this.height = DISPLAY_SPRITE_SIZE;

    this.runFrames = ['run_1','run_2','run_3','run_4'];
    this.jumpFrame = 'jump';
    this.runFrameIndex = 0;
    this.runAnimTimer = 0;
    this.runAnimInterval = 100;
    this.isDead = false;
  }

  update(dt) {
    if (this.isDead) return;

    this.vy += GRAVITY * (dt / 1000);
    this.sprite.y += this.vy * (dt / 1000);

    const groundY = GROUND_LINE_Y - this.height / 2;
    if (this.sprite.y >= groundY) {
      if (!this.isOnGround) this.scene.onPlayerLand();
      this.sprite.y = groundY;
      this.vy = 0;
      this.isOnGround = true;
    } else {
      this.isOnGround = false;
    }

    if (!this.isOnGround) {
      this.sprite.setTexture(this.jumpFrame);
    } else {
      this.runAnimTimer += dt;
      if (this.runAnimTimer >= this.runAnimInterval) {
        this.runAnimTimer = 0;
        this.runFrameIndex = (this.runFrameIndex + 1) % this.runFrames.length;
        this.sprite.setTexture(this.runFrames[this.runFrameIndex]);
      }
    }
  }

  jump() {
    if (!this.isOnGround || this.isDead) return;
    this.vy = JUMP_VELOCITY;
    this.isOnGround = false;
    this.scene.soundPlay('jump');
  }
getAABB() {
  const shrink = 0.5; // 80% of real size
  const w = this.width * shrink;
  const h = this.height * shrink;
  return {
    x: this.sprite.x - w / 2,
    y: this.sprite.y - h / 2,
    w: w,
    h: h
  };
}


  setDead() { this.isDead = true; }
  reset(x, y) {
    this.sprite.x = x; this.sprite.y = y;
    this.vy = 0; this.isDead = false;
    this.runFrameIndex = 0; this.runAnimTimer = 0;
    this.sprite.setTexture(this.runFrames[0]);
  }
}

class Box {
  constructor(scene, x, y, speed) {
    this.scene = scene;
    this.sprite = scene.add.image(x, y, 'box')
      .setDisplaySize(DISPLAY_SPRITE_SIZE, DISPLAY_SPRITE_SIZE)
      .setOrigin(0.5);

    this.vy = 0;
    this.vx = -speed;   // all boxes same speed
    this.width = DISPLAY_SPRITE_SIZE;
    this.height = DISPLAY_SPRITE_SIZE;
    this.hasLanded = false;
    this.markedForRemoval = false;
  }

  update(dt) {
    if (!this.hasLanded) {
      this.vy += GRAVITY * (dt / 1000);
      this.sprite.y += this.vy * (dt / 1000);
    }
    this.sprite.x += this.vx * (dt / 1000);

    const groundY = GROUND_LINE_Y - this.height / 2;
    if (!this.hasLanded && this.sprite.y >= groundY) {
      this.sprite.y = groundY;
      this.vy = 0; this.hasLanded = true;
      // this.scene.onBoxLand(this);
    }

    if (this.sprite.x < -100) this.markedForRemoval = true;
  }

  getAABB() {
    return {
      x: this.sprite.x - this.width / 2,
      y: this.sprite.y - this.height / 2,
      w: this.width,
      h: this.height
    };
  }
  destroy() { this.sprite.destroy(); }
}

class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
    this.boxes = [];
  }

  preload() {
    this.load.image('run_1','player/run_1.png');
    this.load.image('run_2','player/run_2.png');
    this.load.image('run_3','player/run_3.png');
    this.load.image('run_4','player/run_4.png');
    this.load.image('jump','player/jump.png');
    this.load.image('box','box.png');
    this.load.audio('jump','sounds/jump.ogg');
    this.load.audio('land','sounds/land.ogg');
  }

  create() {
    // Draw floor line behind everything
    this.floor = this.add.graphics();
    this.floor.lineStyle(4, 0x000000, 1);
    this.floor.moveTo(0, GROUND_LINE_Y-50);
    this.floor.lineTo(GAME_WIDTH, GROUND_LINE_Y-50);
    this.floor.strokePath();
    this.floor.setDepth(-1); // ensure behind sprites

    const px = GAME_WIDTH * 0.18;
    const py = GROUND_LINE_Y - DISPLAY_SPRITE_SIZE/2;
    this.player = new Player(this, px, py);

    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('highscore') || '0');
    this.scoreText = this.add.text(20, 20, 'Score: 0', { font: '20px Arial', fill: '#000' });
    this.highText = this.add.text(GAME_WIDTH - 20, 20, `High: ${this.highScore}`, { font: '20px Arial', fill: '#000' }).setOrigin(1,0);

    this.sfx = { jump: this.sound.add('jump'), land: this.sound.add('land') };

    this.input.on('pointerdown', () => { if (!this.isGameOver) this.player.jump(); });
    this.input.keyboard.on('keydown', () => { if (!this.isGameOver) this.player.jump(); });

    this.spawnTimer = 0;
    this.isGameOver = false;

    this.createGameOverUI();
  }

  createGameOverUI() {
    const overlay = this.add.container(0,0).setVisible(false).setDepth(100);
    //const rect = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, 400, 200, 0x000000, 0.6);
    const title = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2 - 40, 'Game Over', { font: '36px Arial', fill: '#fff' }).setOrigin(0.5);
    const scoreLbl = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2, 'Score: 0', { font: '22px Arial', fill: '#fff' }).setOrigin(0.5);
    const retry = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2+60, 140, 50, 0xffffff).setInteractive();
    const retryTxt = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2+60, 'Retry', { font: '20px Arial', fill: '#000' }).setOrigin(0.5);

    retry.on('pointerdown', () => { overlay.setVisible(false); this.resetGame(); });
    overlay.add([title,scoreLbl,retry,retryTxt]);
    overlay.scoreLbl = scoreLbl;
    this.overlay = overlay;
  }

  soundPlay(n){ if(this.sfx[n]) this.sfx[n].play(); }
  onPlayerLand(){ 
    //this.soundPlay('land'); 
    }
  onBoxLand(b){ if(!b.landedSound){ this.soundPlay('land'); b.landedSound=true; } }

  spawnBox() {
    const x = GAME_WIDTH + 60;
    const y = BOX_FALL_START_Y - Math.random()*100;
    this.boxes.push(new Box(this, x, y, currentBoxSpeed));
  }

  update(_, dt) {
    if (this.isGameOver) return;

    this.player.update(dt);
    this.boxes.forEach(b=>b.update(dt));

    this.spawnTimer += dt;
    if (this.spawnTimer >= BOX_SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      BOX_SPAWN_INTERVAL = Math.max(800, Math.random()*2000);
      this.spawnBox();
    }

    // Collision
    const pBox = this.player.getAABB();
    for (const b of this.boxes) {
      if (!b.markedForRemoval && this.intersect(pBox,b.getAABB())) this.gameOver();
    }

    // Remove offscreen
    this.boxes = this.boxes.filter(b=>{ if(b.markedForRemoval){ b.destroy(); return false;} return true; });

    // Score and speed ramp
    this.score += dt/100; // ~10 points/sec
    this.scoreText.setText(`Score: ${Math.floor(this.score)}`);
    if (Math.floor(this.score)>this.highScore){
      this.highScore=Math.floor(this.score);
      this.highText.setText(`High: ${this.highScore}`);
    }

    currentBoxSpeed = Math.min(currentBoxSpeed + SPEED_INCREASE * dt/1000, MAX_BOX_SPEED);
  }

  intersect(a,b){ return !(a.x+a.w<b.x||b.x+b.w<a.x||a.y+a.h<b.y||b.y+b.h<a.y); }

  gameOver() {
    this.isGameOver=true;
    this.player.setDead();
    this.overlay.scoreLbl.setText(`Score: ${Math.floor(this.score)}`);
    this.overlay.setVisible(true);
    if (Math.floor(this.score)>parseInt(localStorage.getItem('highscore')||'0'))
      localStorage.setItem('highscore',Math.floor(this.score));
  }

  resetGame() {
    this.boxes.forEach(b=>b.destroy());
    this.boxes=[];
    const px = GAME_WIDTH*0.18, py=GROUND_LINE_Y-DISPLAY_SPRITE_SIZE/2;
    this.player.reset(px,py);
    this.score=0; currentBoxSpeed=280; this.isGameOver=false;
    this.scoreText.setText('Score: 0');
    this.highScore=parseInt(localStorage.getItem('highscore')||'0');
    this.highText.setText(`High: ${this.highScore}`);
  }
}

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  scene: [MainScene],
  backgroundColor: '#ffffff'
};

new Phaser.Game(config);
