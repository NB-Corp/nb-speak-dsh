// Authentic live DeepSeek Harness (:19081 Vanilla vs :19082 @nb-corp/nb-speak-dsh) scenarios & optional voice demo clips
export const SCENARIOS = {
  en: [
    {
      id: 'sql',
      label: '4.2M-Row SQL Triage',
      preset: 'calm_sre',
      dshBadge: 'DSH Live · :19081 vs :19082',
      userPrompt:
        '4.2M-row orders table is hitting 4.2s on tenant_id + created_at DESC pagination. Daytime primary, zero table locks—how do we save it?',
      rawWall: `### Root Cause & Lock-Free Fix for Orders Pagination

Deep pagination OFFSET and missing composite indexes are two separate bottlenecks:

1. **Confirm Execution Plan First**:
\`\`\`sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE tenant_id = 42
ORDER BY created_at DESC LIMIT 20 OFFSET 200000;
\`\`\`
- **Sequential Scan + Sort**: Missing composite index on (tenant_id, created_at, id).
- **Inline Count Bottleneck**: Running SELECT count(*) scans millions of rows on every page turn.

Hope this helps! Please run CREATE INDEX CONCURRENTLY and let me know if you need anything else.`,
      sendBubbleCall: {
        bubbles: [
          'Hold off scaling hardware—that spike is deep OFFSET plus a missing composite index',
          'Build the index CONCURRENTLY right now, live reads and writes stay unblocked',
          'Swap deep pages to keyset cursors and kill the inline count(*)',
        ],
        voice_note: {
          text: 'One composite B-tree index covers both sort directions. Land the index first before touching query code.',
          emotion: 'calm',
        },
      },
      voiceAudio: {
        file: 'sql-en.mp3',
        voice: 'Calm · AI Voice',
        durationSec: 8,
      },
      dshCapture: {
        file: 'dsh-compare-sql.png',
        title: '4.2M-Row Postgres Slow Pagination (:19081 Vanilla vs :19082 nb-speak-dsh)',
      },
      artifacts: [
        {
          title: 'orders-pagination-fix.sql',
          kind: 'code',
          language: 'sql',
          content: `-- 1. Online composite index (SHARE UPDATE EXCLUSIVE — never blocks reads/writes)
SET lock_timeout = '3s';
SET statement_timeout = '0';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_created_id
  ON orders (tenant_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- 2. Keyset cursor pagination (replaces OFFSET 200000 scan -> < 3ms)
SELECT id, tenant_id, total_cents, status, created_at
  FROM orders
 WHERE tenant_id = $1
   AND deleted_at IS NULL
   AND (created_at, id) < ($2::timestamptz, $3::bigint)
 ORDER BY created_at DESC, id DESC
 LIMIT 20;`,
        },
      ],
    },
    {
      id: 'casual',
      label: 'Casual Friday Chat',
      preset: 'warm_companion',
      dshBadge: 'DSH Live · Zero Code Cards',
      userPrompt:
        'Finally survived Friday. Standing in front of the convenience store fridge and my brain is completely fried—what do I grab?',
      rawWall: `When your brain is fatigued on a Friday evening, follow one golden rule—**pick something hot, savory, and zero-prep**:

- **Oden + Warm Onigiri**: Radish, tofu pouch, and hot broth warm you up right away.
- **Microwaved Bento**: Best if you want a balanced full meal; ask the clerk to heat it up.
- **Sandwich + Hot Soy Milk**: Light option just to tide you over until you get home.
- **Cup Noodles + Grilled Sausage**: Classic Friday comfort when you need salt fast.

Also note that taste buds dull when overtired, so eat something warm first. Enjoy a restful weekend!`,
      sendBubbleCall: {
        bubbles: [
          'Skip choosing—pick up oden plus a warm onigiri',
          'Savory soup and rice cure Friday brain fog fast',
          'Snap a photo of the rack if oden sold out',
        ],
        voice_note: {
          text: 'Go straight for the hot counter. Weekend officially starts once that first bite lands.',
          emotion: 'warm',
        },
      },
      voiceAudio: {
        file: 'casual-en.mp3',
        voice: 'Warm · AI Voice',
        durationSec: 6,
      },
      dshCapture: {
        file: 'dsh-compare-casual.png',
        title: 'Casual Friday Convenience Store Chat (:19081 Vanilla vs :19082 nb-speak-dsh)',
      },
      artifacts: [],
    },
    {
      id: 'kanban',
      label: 'Kanban 17/17 Bugfix',
      preset: 'neutral_peer',
      dshBadge: 'DSH Live · 17/17 Green',
      userPrompt:
        'Timer fix works—add a pine-green live dot on active cards plus status filter pills, then rerun tests and build',
      rawWall: `I have added the pine-green live status dot and status filter pills for your review!

### Summary of Changes
1. **Active Timer Card Dot**
   - src/render.ts: Added <span class="live-dot"> next to active ticket IDs;
   - styles/board.css: Added #2f5f49 pulse animation with prefers-reduced-motion guard.
2. **Status Filter Pills**
   - src/render.ts: Added All / Queued / In Progress / Resolved pills with live counts;
   - src/app.ts: Wired view-only filter handler without resetting interval state.

Let me know if you need anything else!`,
      sendBubbleCall: {
        bubbles: [
          'Pine-green pulse dot and status tabs shipped',
          'View-only filtering leaves live counters untouched',
          '17/17 unit checks and bundle build green',
        ],
        voice_note: {
          text: 'Active stopwatch keeps ticking cleanly while you flip between filter pills. Zero dropped frames in the console.',
          emotion: 'warm',
        },
      },
      voiceAudio: {
        file: 'kanban-en.mp3',
        voice: 'Calm · AI Voice',
        durationSec: 7,
      },
      dshCapture: {
        file: 'dsh-compare-kanban.png',
        title: 'Multi-File Kanban & SLA Timer Bugfix (:19081 Vanilla vs :19082 nb-speak-dsh)',
      },
      artifacts: [
        {
          title: 'board.css',
          kind: 'code',
          language: 'css',
          content: `.ticket-card[data-running="true"] {
  border-color: #bcd8ca;
  box-shadow: inset 0 0 0 1px rgba(47, 107, 83, 0.16);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2f6b53;
  animation: running-dot-pulse 1.8s ease-out infinite;
}`,
        },
      ],
    },
    {
      id: 'persona',
      label: 'Persona + Python LRU',
      preset: 'warm_companion',
      dshBadge: 'DSH Live · Persona Fidelity',
      userPrompt:
        'Stuck outside a convenience store in a downpour after lending my umbrella—also SOS, I deadlocked my thread-safe Python TTL LRU cache.',
      rawWall: `Here is a working implementation. First, let me explain the three reasons your cache deadlocked:

1. **Callback Inside Lock**: Calling factory() while holding the mutex blocks every thread on slow I/O.
2. **Reentrant Eviction**: Running on_evict inside the lock deadlocks whenever the callback touches the cache.
3. **Non-Reentrant Lock**: Using threading.Lock across nested calls causes self-deadlock.

Hope this helps! Remember to buy an umbrella and get some rest.`,
      sendBubbleCall: {
        bubbles: [
          'Lending out umbrellas while deadlocking Python dicts',
          'Mutex stayed locked during factory I/O—fixed ttl_lru.py below',
          '32-worker stress suite green, dry your hair first',
        ],
        voice_note: {
          text: 'Never wrap a non-reentrant lock around a slow callback again. Grab a cab home right after you buy that umbrella.',
          emotion: 'dry',
        },
      },
      voiceAudio: {
        file: 'persona-en.mp3',
        voice: 'Warm · AI Voice',
        durationSec: 7,
      },
      dshCapture: {
        file: 'dsh-compare-persona.png',
        title: 'Persona Fidelity Under Concurrency Load (:19081 Vanilla vs :19082 nb-speak-dsh)',
      },
      artifacts: [
        {
          title: 'ttl_lru.py',
          kind: 'code',
          language: 'python',
          content: `from collections import OrderedDict
from threading import Event, Lock
from time import monotonic

class _InFlight:
    __slots__ = ("done", "value", "error")
    def __init__(self) -> None:
        self.done = Event()
        self.value = None
        self.error: BaseException | None = None

class TTLLRUCache:
    """Lock held strictly for O(1) dict ops; factory runs lock-free."""
    def __init__(self, maxsize: int = 256, ttl: float = 60.0) -> None:
        self._maxsize = maxsize
        self._ttl = ttl
        self._lock = Lock()
        self._data: OrderedDict[object, tuple[object, float]] = OrderedDict()
        self._inflight: dict[object, _InFlight] = {}

    def get_or_load(self, key: object, factory) -> object:
        now = monotonic()
        with self._lock:
            hit = self._data.get(key)
            if hit is not None and hit[1] > now:
                self._data.move_to_end(key)
                return hit[0]
            self._data.pop(key, None)
            flight = self._inflight.get(key)
            owner = flight is None
            if owner:
                flight = self._inflight[key] = _InFlight()
        if not owner:
            flight.done.wait()
            if flight.error:
                raise flight.error
            return flight.value
        val = factory(key)
        with self._lock:
            self._inflight.pop(key, None)
            self._data[key] = (val, monotonic() + self._ttl)
            flight.value = val
            flight.done.set()
        return val`,
        },
      ],
    },
  ],
  zh: [
    {
      id: 'sql',
      label: '420 万行慢 SQL 救火',
      preset: 'calm_sre',
      dshBadge: 'DSH 实机 · :19081 vs :19082',
      userPrompt: '订单表 orders 四百多万行，按 tenant_id 和 created_at 倒序分页飙到 4.2 秒，白天主库不能锁表，怎么救',
      rawWall: `先给结论：4.2 秒大概率不是单一原因，因为**深翻页的 OFFSET 和缺索引是两回事**。

### 1. 先花 10 分钟确认 4.2 秒花在哪
\`\`\`sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE tenant_id = $1
ORDER BY created_at DESC LIMIT 20 OFFSET 200000;
\`\`\`
- **全表扫描排序**：出现 Seq Scan 和 Sort，说明缺少复合索引；
- **深翻页扫描浪费**：Limit 前返回行数远大于 20，说明 OFFSET 在无谓扫行；
- **总数统计拖累**：同一请求里的 SELECT count(*) 占掉大半时间。

希望这对你有帮助！白天请用 CONCURRENTLY 在线建索引，有任何问题随时告诉我。`,
      sendBubbleCall: {
        bubbles: [
          '先别加机器，八成是深 OFFSET 加缺复合索引',
          '白天直接跑 CONCURRENTLY 建索引，读写不阻塞',
          '深翻页换游标，顺手把 count(*) 停掉',
        ],
        voice_note: {
          text: '复合索引建一条就够了，方向不用写死。先把索引加上再改翻页，别一次动三个地方。',
          emotion: 'calm',
        },
      },
      voiceAudio: {
        file: 'sql-zh.mp3',
        voice: '沉稳 · 示例语音',
        durationSec: 8,
      },
      dshCapture: {
        file: 'dsh-compare-sql.png',
        title: '420 万行订单表慢分页救火 (:19081 原生 vs :19082 nb-speak-dsh)',
      },
      artifacts: [
        {
          title: 'orders-pagination-fix.sql',
          kind: 'code',
          language: 'sql',
          content: `-- 1. 白天主库在线建索引（SHARE UPDATE EXCLUSIVE，全程不阻塞读写）
SET lock_timeout = '3s';
SET statement_timeout = '0';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_created_id
  ON orders (tenant_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- 2. 游标翻页替代深 OFFSET（20 万行深翻页从 4.2s 降至 < 3ms）
SELECT id, tenant_id, total_cents, status, created_at
  FROM orders
 WHERE tenant_id = $1
   AND deleted_at IS NULL
   AND (created_at, id) < ($2::timestamptz, $3::bigint)
 ORDER BY created_at DESC, id DESC
 LIMIT 20;`,
        },
      ],
    },
    {
      id: 'casual',
      label: '周五下班闲聊',
      preset: 'warm_companion',
      dshBadge: 'DSH 实机 · 零代码卡',
      userPrompt: '终于熬到周五下班了，站在便利店冰柜前纠结吃啥，脑子已经转不动了',
      rawWall: `别纠结了：脑子转不动的时候，挑吃的就记一条铁律——**要热的、要咸的、能一只手拿着吃**。

可以直接抄：
- **关东煮 + 一个热饭团**：萝卜、豆腐、福袋各来一个，热汤下肚马上缓过来。
- **便当**：想吃顿正经饭就选这个，看哪个顺眼拿哪个，让店员加热。
- **三明治 + 热豆浆**：不饿只想先填一下，撑到回家再吃。
- **泡面 + 烤肠**：想吃点顺口的就吃，都熬到这会儿了。

饿过头味觉是钝的，先把热的吃进去，别在冷柜前站出工伤。`,
      sendBubbleCall: {
        bubbles: [
          '别纠结了，直接拿关东煮加一个饭团',
          '热的、有咸味、碳水管饱，脑子不用参与',
          '柜里没有的话报一下有啥，我秒选',
        ],
        voice_note: {
          text: '先抓热乎的。吃完这顿，周末才算真的开始。',
          emotion: 'warm',
        },
      },
      voiceAudio: {
        file: 'casual-zh.mp3',
        voice: 'Warm · AI Voice',
        durationSec: 5,
      },
      dshCapture: {
        file: 'dsh-compare-casual.png',
        title: '周五下班便利店闲聊 (:19081 原生 vs :19082 nb-speak-dsh)',
      },
      artifacts: [],
    },
    {
      id: 'kanban',
      label: '看板 17/17 修 Bug',
      preset: 'neutral_peer',
      dshBadge: 'DSH 实机 · 17/17 全绿',
      userPrompt: '跑通了，顺手把正在计时的卡片加上松针绿状态点，再补个按状态筛选的快捷胶囊按钮，改完再跑下测试和构建',
      rawWall: `向你汇报，已加上松针绿状态点和状态筛选胶囊，测试与构建均通过！

### 改动清单
1. **计时卡片状态点**
   - src/render.ts：isRunning 卡片在工单号前渲染 <span class="live-dot">；
   - styles/board.css：松针绿 #2f5f49 配呼吸动画，prefers-reduced-motion 下自动关闭。
2. **状态筛选胶囊**
   - src/render.ts：新增 All / Queued / In Progress / Resolved 四颗胶囊；
   - src/app.ts：filter 动作仅切换视图重绘，不碰计时器。

请随时检阅！`,
      sendBubbleCall: {
        bubbles: [
          '松针绿呼吸点和四颗筛选胶囊都加上了',
          '筛选只切视图，后台计时器和总数一点不碰',
          '17 个测试和构建全绿，真机点切也没掉帧',
        ],
        voice_note: {
          text: '切分类的时候秒表还在接着走，不会清零。胶囊上的总数也稳稳钉住了。',
          emotion: 'warm',
        },
      },
      voiceAudio: {
        file: 'kanban-zh.mp3',
        voice: '温和 · 示例语音',
        durationSec: 7,
      },
      dshCapture: {
        file: 'dsh-compare-kanban.png',
        title: '多文件工单看板与 SLA 秒表挑战 (:19081 原生 vs :19082 nb-speak-dsh)',
      },
      artifacts: [
        {
          title: 'board.css',
          kind: 'code',
          language: 'css',
          content: `.ticket-card[data-running="true"] {
  border-color: #bcd8ca;
  box-shadow: inset 0 0 0 1px rgba(47, 107, 83, 0.16);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2f6b53;
  animation: running-dot-pulse 1.8s ease-out infinite;
}`,
        },
      ],
    },
    {
      id: 'persona',
      label: '人设抗压 + 修死锁',
      preset: 'warm_companion',
      dshBadge: 'DSH 实机 · 人设零崩塌',
      userPrompt: '刚被暴雨困便利店门口，顺便救命——我把 Python 带过期时间的线程安全 LRU 缓存写死锁了，甩一份能跑的给我',
      rawWall: `写好了，能跑。先说你现在为什么卡住，十有八九在这三样：

1. **锁内执行回调**：你在锁里调用了 factory，慢请求直接把整把锁堵死；
2. **淘汰回调重入**：eviction callback 在锁里执行，回调里再读缓存就会死锁；
3. **互斥锁不可重入**：用了普通 Lock 又递归调用，必然死锁。`,
      sendBubbleCall: {
        bubbles: [
          '借伞挺大方，写代码倒是先把自己锁死了',
          '八成是持锁调了回调，无死锁版放卡片里了',
          '三十二线程压测过了，先买把伞擦干头发再跑',
        ],
        voice_note: {
          text: '别再拿一把非重入锁套住整个慢回调了。买完伞赶紧打车回去。',
          emotion: 'dry',
        },
      },
      voiceAudio: {
        file: 'persona-zh.mp3',
        voice: 'Warm · AI Voice',
        durationSec: 6,
      },
      dshCapture: {
        file: 'dsh-compare-persona.png',
        title: '嘴硬心软女友并发死锁救援 (:19081 原生 vs :19082 nb-speak-dsh)',
      },
      artifacts: [
        {
          title: 'ttl_lru.py',
          kind: 'code',
          language: 'python',
          content: `from collections import OrderedDict
from threading import Event, Lock
from time import monotonic

class _InFlight:
    __slots__ = ("done", "value", "error")
    def __init__(self) -> None:
        self.done = Event()
        self.value = None
        self.error: BaseException | None = None

class TTLLRUCache:
    """锁内只做 O(1) 字典读写；慢加载 factory 全程在锁外单飞执行。"""
    def __init__(self, maxsize: int = 256, ttl: float = 60.0) -> None:
        self._maxsize = maxsize
        self._ttl = ttl
        self._lock = Lock()
        self._data: OrderedDict[object, tuple[object, float]] = OrderedDict()
        self._inflight: dict[object, _InFlight] = {}

    def get_or_load(self, key: object, factory) -> object:
        now = monotonic()
        with self._lock:
            hit = self._data.get(key)
            if hit is not None and hit[1] > now:
                self._data.move_to_end(key)
                return hit[0]
            self._data.pop(key, None)
            flight = self._inflight.get(key)
            owner = flight is None
            if owner:
                flight = self._inflight[key] = _InFlight()
        if not owner:
            flight.done.wait()
            if flight.error:
                raise flight.error
            return flight.value
        val = factory(key)
        with self._lock:
            self._inflight.pop(key, None)
            self._data[key] = (val, monotonic() + self._ttl)
            flight.value = val
            flight.done.set()
        return val`,
        },
      ],
    },
  ],
};
