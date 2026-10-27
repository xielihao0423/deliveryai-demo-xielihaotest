import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'

type GameState = 'idle' | 'running' | 'paused' | 'gameover'
interface Point {
  x: number
  y: number
}

const GRID_SIZE = 20
const CELL_SIZE = 20
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE
const INITIAL_TICK = 150
const MIN_TICK = 60
const TICK_DECREMENT = 15
const SPEED_UP_EVERY = 5
const FOOD_SCORE = 10
const INITIAL_SNAKE_LENGTH = 3
const STORAGE_KEY = 'snake_high_score'

const COLORS = {
  canvasBg: '#1a0f0a',
  gridLine: 'rgba(255, 250, 240, 0.04)',
  snakeHead: '#5cb86b',
  snakeBody: '#3d8f4f',
  snakeBorder: '#2a6b38',
  food: '#b83a2f',
  foodGlow: 'rgba(184, 58, 47, 0.35)',
  foodPulse: '#d24b1f',
}

const DIR_MAP: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
  s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
  a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
  d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
}

interface GameData {
  snake: Point[]
  direction: Point
  nextDirection: Point
  food: Point | null
  score: number
  foodEaten: number
  tickInterval: number
  state: GameState
  lastTickTime: number
  foodPulsePhase: number
  highScore: number
  isNewRecord: boolean
  localStorageAvailable: boolean
}

function createInitialSnake(): Point[] {
  const startX = Math.floor(GRID_SIZE / 2) - 1
  const startY = Math.floor(GRID_SIZE / 2)
  const snake: Point[] = []
  for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
    snake.push({ x: startX - i, y: startY })
  }
  return snake
}

function generateFood(snake: Point[]): Point | null {
  const occupied = new Set(snake.map((s) => `${s.x},${s.y}`))
  const free: Point[] = []
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y })
    }
  }
  if (free.length === 0) return null
  return free[Math.floor(Math.random() * free.length)]
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

interface SnakeGameProps {
  onBack: () => void
}

export function SnakeGame({ onBack }: SnakeGameProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<GameState>('idle')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [speedLevel, setSpeedLevel] = useState(1)
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [popSignal, setPopSignal] = useState(0)
  // resetRef 暴露重置能力给按钮 / R 键
  const resetRef = useRef<() => void>(() => {})
  // onBack 在事件中调用，用 ref 保持最新引用
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const game: GameData = {
      snake: createInitialSnake(),
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: null,
      score: 0,
      foodEaten: 0,
      tickInterval: INITIAL_TICK,
      state: 'idle',
      lastTickTime: 0,
      foodPulsePhase: 0,
      highScore: 0,
      isNewRecord: false,
      localStorageAvailable: true,
    }

    // localStorage 可用性探测
    try {
      const testKey = '__snake_test__'
      localStorage.setItem(testKey, '1')
      localStorage.removeItem(testKey)
    } catch {
      game.localStorageAvailable = false
    }
    if (game.localStorageAvailable) {
      try {
        const val = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10)
        game.highScore = isNaN(val) ? 0 : val
        setHighScore(game.highScore)
      } catch {
        game.localStorageAvailable = false
      }
    }

    function draw() {
      if (!ctx) return
      ctx.fillStyle = COLORS.canvasBg
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

      ctx.strokeStyle = COLORS.gridLine
      ctx.lineWidth = 1
      for (let i = 0; i <= GRID_SIZE; i++) {
        const p = i * CELL_SIZE
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, CANVAS_SIZE); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(CANVAS_SIZE, p); ctx.stroke()
      }

      // 食物（脉冲发光）
      if (game.food) {
        const fx = game.food.x * CELL_SIZE + CELL_SIZE / 2
        const fy = game.food.y * CELL_SIZE + CELL_SIZE / 2
        const pulse = Math.sin(game.foodPulsePhase) * 0.15 + 0.85
        const baseR = CELL_SIZE / 2 - 3
        const glowR = baseR + 6 + Math.sin(game.foodPulsePhase) * 3
        const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, glowR)
        grad.addColorStop(0, COLORS.foodGlow)
        grad.addColorStop(1, 'rgba(184, 58, 47, 0)')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(fx, fy, glowR, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = COLORS.food
        ctx.beginPath(); ctx.arc(fx, fy, baseR * pulse, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = COLORS.foodPulse
        ctx.beginPath(); ctx.arc(fx - 2, fy - 2, 2, 0, Math.PI * 2); ctx.fill()
      }

      // 蛇身（从尾到头绘制）
      for (let i = game.snake.length - 1; i >= 0; i--) {
        const seg = game.snake[i]
        const px = seg.x * CELL_SIZE
        const py = seg.y * CELL_SIZE
        const isHead = i === 0
        ctx.fillStyle = isHead ? COLORS.snakeHead : COLORS.snakeBody
        roundRect(ctx, px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2, isHead ? 6 : 4)
        ctx.fill()
        ctx.strokeStyle = COLORS.snakeBorder
        ctx.lineWidth = 1
        roundRect(ctx, px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2, isHead ? 6 : 4)
        ctx.stroke()

        if (isHead) {
          const eyeOffset = 4
          const eyeR = 2.5
          const cx = px + CELL_SIZE / 2
          const cy = py + CELL_SIZE / 2
          let e1x = cx, e1y = cy, e2x = cx, e2y = cy
          if (game.direction.x === 1) { e1x = cx + 3; e1y = cy - eyeOffset; e2x = cx + 3; e2y = cy + eyeOffset }
          else if (game.direction.x === -1) { e1x = cx - 3; e1y = cy - eyeOffset; e2x = cx - 3; e2y = cy + eyeOffset }
          else if (game.direction.y === -1) { e1x = cx - eyeOffset; e1y = cy - 3; e2x = cx + eyeOffset; e2y = cy - 3 }
          else { e1x = cx - eyeOffset; e1y = cy + 3; e2x = cx + eyeOffset; e2y = cy + 3 }
          ctx.fillStyle = '#1a0f0a'
          ctx.beginPath(); ctx.arc(e1x, e1y, eyeR, 0, Math.PI * 2); ctx.arc(e2x, e2y, eyeR, 0, Math.PI * 2); ctx.fill()
        }
      }
    }

    function endGame() {
      game.state = 'gameover'
      setGameState('gameover')
      let newRecord = false
      if (game.score > game.highScore) {
        game.highScore = game.score
        newRecord = true
        if (game.localStorageAvailable) {
          try { localStorage.setItem(STORAGE_KEY, String(game.highScore)) } catch { /* 降级：忽略 */ }
        }
      }
      game.isNewRecord = newRecord
      setIsNewRecord(newRecord)
      if (game.localStorageAvailable) setHighScore(game.highScore)
    }

    function tick() {
      game.direction = game.nextDirection
      const head = game.snake[0]
      const newHead: Point = { x: head.x + game.direction.x, y: head.y + game.direction.y }

      // 碰撞：墙壁
      if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
        endGame()
        return
      }

      const ateFood = game.food !== null && newHead.x === game.food.x && newHead.y === game.food.y
      // 碰撞：自身（未吃食物时尾部会移走，不检查尾节）
      const bodyToCheck = ateFood ? game.snake : game.snake.slice(0, -1)
      for (const seg of bodyToCheck) {
        if (seg.x === newHead.x && seg.y === newHead.y) {
          endGame()
          return
        }
      }

      game.snake.unshift(newHead)

      if (ateFood) {
        game.score += FOOD_SCORE
        game.foodEaten++
        if (game.foodEaten % SPEED_UP_EVERY === 0 && game.tickInterval > MIN_TICK) {
          game.tickInterval = Math.max(MIN_TICK, game.tickInterval - TICK_DECREMENT)
        }
        game.food = generateFood(game.snake)
        if (!game.food) { endGame(); return }
        setScore(game.score)
        setSpeedLevel(Math.floor((INITIAL_TICK - game.tickInterval) / TICK_DECREMENT) + 1)
        setPopSignal((n) => n + 1)
      } else {
        game.snake.pop()
      }
    }

    function gameLoop(timestamp: number) {
      if (game.state === 'running') {
        if (timestamp - game.lastTickTime >= game.tickInterval) {
          tick()
          game.lastTickTime = timestamp
        }
      }
      game.foodPulsePhase += 0.06
      draw()
      rafId = requestAnimationFrame(gameLoop)
    }

    function initGame() {
      game.snake = createInitialSnake()
      game.direction = { x: 1, y: 0 }
      game.nextDirection = { x: 1, y: 0 }
      game.food = generateFood(game.snake)
      game.score = 0
      game.foodEaten = 0
      game.tickInterval = INITIAL_TICK
      game.state = 'idle'
      game.lastTickTime = 0
      game.isNewRecord = false
      setScore(0)
      setSpeedLevel(1)
      setGameState('idle')
      setIsNewRecord(false)
      draw()
    }

    resetRef.current = initGame

function handleKey(e: KeyboardEvent) {
      // 空格：暂停 / 恢复
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (game.state === 'running') {
          game.state = 'paused'
          setGameState('paused')
        } else if (game.state === 'paused') {
          game.state = 'running'
          game.lastTickTime = performance.now()
          setGameState('running')
        }
        // idle / gameover 忽略空格
        return
      }

      // R：重开（仅在游戏结束时）
      if (e.key === 'r' || e.key === 'R') {
        if (game.state === 'gameover') initGame()
        return
      }

      const dir = DIR_MAP[e.key]
      if (!dir) return

      // 禁止 180° 反向
      if (dir.x === -game.direction.x && dir.y === -game.direction.y) return

      if (e.key.startsWith('Arrow')) e.preventDefault()

      if (game.state === 'idle') {
        game.nextDirection = dir
        game.state = 'running'
        game.lastTickTime = performance.now()
        setGameState('running')
      } else if (game.state === 'running') {
        game.nextDirection = dir
      }
      // paused / gameover 忽略方向键
    }

    window.addEventListener('keydown', handleKey)
    let rafId = requestAnimationFrame(gameLoop)
    initGame()

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('keydown', handleKey)
    }
    // 仅在挂载时建立游戏循环与键盘监听
  }, [])

  const maxLevels = Math.floor((INITIAL_TICK - MIN_TICK) / TICK_DECREMENT)
  const speedPct = Math.min(100, ((speedLevel - 1) / maxLevels) * 100)

  const statusLabel: Record<GameState, string> = {
    idle: t('snake.status_idle'),
    running: t('snake.status_running'),
    paused: t('snake.status_paused'),
    gameover: t('snake.status_gameover'),
  }

  return (
    <div className="snake-arcade">
      <header className="sa-topnav">
        <div className="sa-topnav-inner">
          <span className="sa-logo">
            Retro<span className="accent">Arcade</span>
          </span>
          <button className="sa-back-btn" onClick={() => onBackRef.current()}>
            <ArrowLeft size={16} /> {t('common.back')}
          </button>
        </div>
      </header>

      <section className="sa-hero">
        <p className="eyebrow">{t('snake.eyebrow')}</p>
        <h1>
          {t('snake.title').slice(0, -1)}
          <span className="accent">{t('snake.title').slice(-1)}</span>
        </h1>
        <p className="subtitle">{t('snake.subtitle')}</p>
      </section>

      <section className="sa-section">
        <div className="sa-layout">
          <div className="sa-canvas-wrap">
            <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} />

            {gameState === 'idle' && (
              <div className="sa-overlay visible">
                <p className="o-eyebrow">{t('snake.ready')}</p>
                <p className="o-title">{t('snake.title')}</p>
                <p className="o-sub">{t('snake.start_hint')}</p>
              </div>
            )}

            {gameState === 'paused' && (
              <div className="sa-overlay visible">
                <p className="o-eyebrow">{t('snake.status_paused')}</p>
                <p className="o-title">{t('snake.paused_title')}</p>
                <p className="o-sub">{t('snake.paused_hint')}</p>
              </div>
            )}

            {gameState === 'gameover' && (
              <div className="sa-overlay visible">
                <p className="o-eyebrow">{t('snake.status_gameover')}</p>
                <p className="o-title">{t('snake.game_over')}</p>
                <div className="o-score">
                  {t('snake.final_score')}：<span className="num">{score}</span>
                </div>
                <div className="o-highscore">
                  {t('snake.high_score')}：{highScore}
                </div>
                {isNewRecord && <div className="sa-new-record">{t('snake.new_record')}</div>}
                <button className="sa-overlay-btn" onClick={() => resetRef.current()}>
                  {t('snake.restart_btn')}
                </button>
              </div>
            )}
          </div>

          <div className="sa-panel">
            <div>
              <span className={`sa-status ${gameState}`}>
                <span className="sa-dot" />
                {statusLabel[gameState]}
              </span>
            </div>

            <div className="sa-card highlight">
              <p className="c-label">{t('snake.score')}</p>
              <span key={popSignal} className="c-value sa-pop">{score}</span>
            </div>

            <div className="sa-row">
              <div className="sa-card">
                <p className="c-label">{t('snake.high_score')}</p>
                <div className="c-value">{highScore}</div>
              </div>
              <div className="sa-card">
                <p className="c-label">{t('snake.speed_level')}</p>
                <div className="c-value">{speedLevel}</div>
                <div className="sa-speed-bar">
                  <div className="sa-speed-fill" style={{ width: `${speedPct}%` }} />
                </div>
              </div>
            </div>

            <div className="sa-card sa-controls">
              <h3>{t('snake.controls_title')}</h3>
              <div className="sa-ctrl-row">
                <span className="sa-ctrl-label">{t('snake.ctrl_move')}</span>
                <span className="sa-keycap-group">
                  <span className="sa-keycap">↑</span>
                  <span className="sa-keycap">↓</span>
                  <span className="sa-keycap">←</span>
                  <span className="sa-keycap">→</span>
                </span>
              </div>
              <div className="sa-ctrl-row">
                <span className="sa-ctrl-label">{t('snake.ctrl_move_alt')}</span>
                <span className="sa-keycap-group">
                  <span className="sa-keycap">W</span>
                  <span className="sa-keycap">A</span>
                  <span className="sa-keycap">S</span>
                  <span className="sa-keycap">D</span>
                </span>
              </div>
              <div className="sa-ctrl-row">
                <span className="sa-ctrl-label">{t('snake.ctrl_pause')}</span>
                <span className="sa-keycap">Space</span>
              </div>
              <div className="sa-ctrl-row">
                <span className="sa-ctrl-label">{t('snake.ctrl_restart')}</span>
                <span className="sa-keycap">R</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="sa-foot">
        <span>© RetroArcade · 2026</span>
        <span>{t('snake.title')} · Canvas · localStorage</span>
      </footer>
    </div>
  )
}
