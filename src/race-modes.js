// Browser-independent race modes. All public times use seconds, distances use metres.
import {CARS} from './car-catalog.js';
import {TRACKS} from './tracks.js';
const RECORD_PREFIX = 'breuer-record:v2:';
const CUP_KEY = 'breuer-cup:v1';
const GHOST_STRIDE = 7;
const GHOST_LIMIT = 18000;
export const CUP_TRACKS = Object.freeze(['lammersdorf', 'bahnhof', 'kraemer']);
export const CUP_POINTS = Object.freeze([10, 8, 6, 4, 2, 1]);

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angleDelta = value => Math.atan2(Math.sin(value), Math.cos(value));
const safeText = (value, fallback, limit = 64) => String(value ?? fallback).replace(/[\u0000-\u001f]/g, '').slice(0, limit);
const lapCount = value => clamp(Math.floor(Number(value) || 1), 1, 10);

function canonical(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return finite(value) ? value : null;
  if (Array.isArray(value)) return value.slice(0, 32).map(item => canonical(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort().slice(0, 32)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      result[key] = canonical(value[key], depth + 1);
    }
    return result;
  }
  return null;
}

/** A record belongs to one exact track/car/rule/assist category. */
export function recordCategory(config = {}) {
  const assists = config.assists && typeof config.assists === 'object' ? config.assists : {};
  return {
    trackId: safeText(config.trackId ?? config.track?.id, 'lammersdorf'),
    trackVersion: safeText(config.trackVersion ?? config.track?.version, '1'),
    ...(config.handlingVersion?{handlingVersion:safeText(config.handlingVersion,'legacy')}:{}),
    car: safeText(config.carId ?? config.car?.id ?? config.car, '0'),
    laps: lapCount(config.laps),
    rules: canonical(config.rules ?? 'action'),
    mode: safeText(config.mode, 'race'),
    raceType: config.raceType==='online'?'online':'solo',
    opponents: ['time-trial','challenge'].includes(config.mode) ? 0 : clamp(Math.trunc(Number(config.opponents ?? 5)) || 0, 0, 5),
    difficulty: canonical(config.difficulty ?? 'none'),
    assists: canonical({ ...assists, autoDrift: assists.autoDrift ?? config.autoDrift ?? true, autoGas: assists.autoGas ?? config.autoGas ?? config.assist ?? false })
  };
}

export function recordKey(config) {
  return RECORD_PREFIX + encodeURIComponent(JSON.stringify(recordCategory(config)));
}

export function bestMedal(previous, earned) {
  const levels=['none','bronze','silver','gold'];
  return levels[Math.max(0,levels.indexOf(previous),levels.indexOf(earned))];
}

function cleanSectors(sectors, max = 30) {
  if (!Array.isArray(sectors)) return [];
  return sectors.slice(0, max).map(value => finite(value) && value > 0 ? value : null);
}

function validGhost(data) {
  if (!data || data.version !== 1 || data.stride !== GHOST_STRIDE || !Array.isArray(data.samples)) return false;
  const samples = data.samples;
  if (samples.length < GHOST_STRIDE || samples.length % GHOST_STRIDE || samples.length > GHOST_LIMIT * GHOST_STRIDE) return false;
  let lastTime = -1;
  for (let offset = 0; offset < samples.length; offset += GHOST_STRIDE) {
    for (let column = 0; column < GHOST_STRIDE; column++) {
      const value = samples[offset + column];
      if (!Number.isSafeInteger(value) || Math.abs(value) > 1e10) return false;
    }
    if (samples[offset] < 0 || samples[offset] <= lastTime || samples[offset + 4] < 0 || samples[offset + 6] < 0 || samples[offset + 6] > 1) return false;
    lastTime = samples[offset];
  }
  return true;
}

/** Quota/security failures keep records for this session and never interrupt a race. */
export class RecordStore {
  constructor(storage, { maxCachedRecords = 16 } = {}) {
    this.storage = storage;
    this.cache = new Map();
    this.maxCachedRecords = clamp(Math.floor(Number(maxCachedRecords) || 16), 1, 64);
  }
  _remember(key, record) {
    this.cache.delete(key);
    this.cache.set(key, record);
    while (this.cache.size > this.maxCachedRecords) this.cache.delete(this.cache.keys().next().value);
  }
  get(config) {
    const key = recordKey(config);
    if (this.cache.has(key)) return this.cache.get(key);
    try {
      const raw = this.storage?.getItem(key);
      if (!raw || raw.length > 2_000_000) return null;
      const record = JSON.parse(raw);
      if (record?.version !== 2 || !finite(record.time) || record.time <= 0 || JSON.stringify(record.config) !== JSON.stringify(recordCategory(config))) return null;
      record.sectors = cleanSectors(record.sectors);
      record.bestSectors = cleanSectors(record.bestSectors ?? record.sectors);
      if (!validGhost(record.ghost)) record.ghost = null;
      this._remember(key, record);
      return record;
    } catch {
      return null;
    }
  }
  save(config, result = {}) {
    const previous = this.get(config);
    if (!finite(result.time) || result.time <= 0) return { saved: false, isBest: false, record: previous, error: 'Ungültige Rennzeit.', ghostSaved: false };
    const isBest = !previous || result.time < previous.time - 1e-6;
    const sectors = cleanSectors(result.sectors, lapCount(config?.laps) * 3);
    const bestSectors = [...(previous?.bestSectors ?? [])];
    let sectorImproved = false;
    sectors.forEach((value, index) => {
      if (value !== null && (bestSectors[index] == null || value < bestSectors[index])) {
        bestSectors[index] = value;
        sectorImproved = true;
      }
    });
    if (!isBest && !sectorImproved) return { saved: false, isBest: false, record: previous, error: null, ghostSaved: !!previous?.ghost };
    const record = {
      version: 2,
      config: recordCategory(config),
      time: isBest ? result.time : previous.time,
      sectors: isBest ? sectors : previous.sectors,
      bestSectors,
      ghost: isBest ? (validGhost(result.ghost) ? result.ghost : null) : previous.ghost,
      updatedAt: Date.now()
    };
    const key = recordKey(config);
    this._remember(key, record);
    let error = null;
    if (typeof this.storage?.setItem !== 'function') return { saved: false, isBest, record, error: 'Rekord bleibt für diese Sitzung gespeichert.', ghostSaved: false };
    try {
      this.storage.setItem(key, JSON.stringify(record));
      return { saved: true, isBest, record, error: null, ghostSaved: !!record.ghost };
    } catch {
      // A compact record often still fits when a large ghost reaches the browser quota.
      if (record.ghost) {
        try {
          this.storage.setItem(key, JSON.stringify({ ...record, ghost: null }));
          return { saved: true, isBest, record, error: 'Bestzeit gespeichert; der Ghost bleibt für diese Sitzung verfügbar.', ghostSaved: false };
        } catch { /* The session record remains available. */ }
      }
      error = 'Rekord bleibt für diese Sitzung gespeichert.';
    }
    return { saved: false, isBest, record, error, ghostSaved: false };
  }
  remove(config) {
    const key = recordKey(config);
    this.cache.delete(key);
    try {
      if (typeof this.storage?.removeItem === 'function') this.storage.removeItem(key);
      else this.storage?.setItem(key, 'null');
      return true;
    } catch { return false; }
  }
}

function packedSample(time, vehicle) {
  if (!finite(time) || time < 0 || !vehicle || ![vehicle.x, vehicle.z, vehicle.angle, vehicle.speed, vehicle.progress].every(finite)) return null;
  return [
    Math.round(time * 1000), Math.round(vehicle.x * 100), Math.round(vehicle.z * 100),
    Math.round(angleDelta(vehicle.angle) * 1000), Math.round(Math.max(0, vehicle.speed) * 100),
    Math.round(vehicle.progress * 100), vehicle.drifting ? 1 : 0
  ];
}

/** Stores 20 Hz by default; very long races reduce sampling instead of losing the ending. */
export class GhostRecorder {
  constructor({ hz = 20, maxSamples = GHOST_LIMIT } = {}) {
    this.hz = clamp(Number(hz) || 20, 1, 20);
    this.maxSamples = clamp(Math.floor(Number(maxSamples) || GHOST_LIMIT), 4, GHOST_LIMIT);
    this.interval = 1 / this.hz;
    this.samples = [];
    this.nextTime = 0;
    this.lastSample = null;
    this.closed = false;
    this.decimated = false;
  }
  _append(sample) {
    const lastOffset = this.samples.length - GHOST_STRIDE;
    if (lastOffset >= 0 && sample[0] <= this.samples[lastOffset]) return false;
    if (this.samples.length / GHOST_STRIDE >= this.maxSamples) {
      const shorter = [];
      for (let offset = 0; offset < this.samples.length; offset += GHOST_STRIDE * 2) {
        for (let column = 0; column < GHOST_STRIDE; column++) shorter.push(this.samples[offset + column]);
      }
      this.samples = shorter;
      this.interval *= 2;
      this.decimated = true;
    }
    this.samples.push(...sample);
    return true;
  }
  sample(time, vehicle) {
    if (this.closed) return false;
    const sample = packedSample(time, vehicle);
    if (!sample || (this.lastSample && sample[0] <= this.lastSample[0])) return false;
    this.lastSample = sample;
    if (time + 1e-7 < this.nextTime) return false;
    const appended = this._append(sample);
    this.nextTime = time + this.interval;
    return appended;
  }
  finish(time, vehicle) {
    if (!this.closed) {
      const final = packedSample(time, vehicle) ?? this.lastSample;
      if (final) this._append(final);
      this.closed = true;
    }
    if (!this.samples.length) return null;
    return {
      version: 1, stride: GHOST_STRIDE, hz: 1 / this.interval,
      duration: this.samples[this.samples.length - GHOST_STRIDE] / 1000,
      decimated: this.decimated, samples: this.samples
    };
  }
}

function unpack(samples, offset) {
  return {
    time: samples[offset] / 1000, x: samples[offset + 1] / 100, z: samples[offset + 2] / 100,
    angle: samples[offset + 3] / 1000, speed: samples[offset + 4] / 100,
    progress: samples[offset + 5] / 100, drifting: !!samples[offset + 6]
  };
}

export class GhostReplay {
  constructor(data) {
    this.data = validGhost(data) ? data : null;
    this.samples = this.data?.samples ?? [];
    this.count = this.samples.length / GHOST_STRIDE;
    this.duration = this.count ? this.samples[(this.count - 1) * GHOST_STRIDE] / 1000 : 0;
    this.frontier = [];
    if (this.count) {
      this.initialProgress = this.samples[5] / 100;
      this.initialTime = this.samples[0] / 1000;
      let peak = this.initialProgress;
      for (let index = 1; index < this.count; index++) {
        const offset = index * GHOST_STRIDE, previous = offset - GHOST_STRIDE;
        const progress = this.samples[offset + 5] / 100;
        if (progress <= peak) continue;
        this.frontier.push({ from: peak, to: progress, p0: this.samples[previous + 5] / 100, t0: this.samples[previous] / 1000, t1: this.samples[offset] / 1000 });
        peak = progress;
      }
      this.maxProgress = peak;
    }
  }
  at(time) {
    if (!this.count || !finite(time)) return null;
    if (time <= this.samples[0] / 1000) return { ...unpack(this.samples, 0), started: time >= this.samples[0] / 1000, finished: time >= this.duration };
    if (time >= this.duration) return { ...unpack(this.samples, (this.count - 1) * GHOST_STRIDE), started: true, finished: true };
    let low = 0, high = this.count - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (this.samples[middle * GHOST_STRIDE] / 1000 <= time) low = middle;
      else high = middle;
    }
    const a = unpack(this.samples, low * GHOST_STRIDE), b = unpack(this.samples, high * GHOST_STRIDE);
    const blend = clamp((time - a.time) / (b.time - a.time), 0, 1);
    return {
      time, x: a.x + (b.x - a.x) * blend, z: a.z + (b.z - a.z) * blend,
      angle: angleDelta(a.angle + angleDelta(b.angle - a.angle) * blend),
      speed: a.speed + (b.speed - a.speed) * blend,
      progress: a.progress + (b.progress - a.progress) * blend,
      drifting: blend < .5 ? a.drifting : b.drifting, started: true, finished: false
    };
  }
  /** Earliest real crossing; stopping or driving backwards cannot move an old split. */
  timeAtProgress(progress) {
    if (!this.count || !finite(progress) || progress < this.initialProgress || progress > this.maxProgress) return null;
    if (progress === this.initialProgress) return this.initialTime;
    let low = 0, high = this.frontier.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.frontier[middle].to >= progress) high = middle;
      else low = middle + 1;
    }
    const segment = this.frontier[low];
    if (!segment) return null;
    return segment.t0 + (segment.t1 - segment.t0) * (progress - segment.p0) / (segment.to - segment.p0);
  }
}

/** Lap/sector crossing times interpolate between physics steps, independent of render FPS. */
export class RaceTiming {
  constructor({ length, laps = 1, ghost = null } = {}) {
    if (!finite(length) || length <= 0) throw new TypeError('Eine positive Streckenlänge ist erforderlich.');
    this.length = length;
    this.laps = lapCount(laps);
    this.ghost = ghost instanceof GhostReplay ? ghost : ghost ? new GhostReplay(ghost) : null;
    this.sectorTimes = [];
    this.lapTimes = [];
    this.splits = [];
    this.completedLaps = 0;
    this.finished = false;
    this.previous = { progress: 0, time: 0 };
    this.lastSplitTime = 0;
    this.lastLapTime = 0;
    this.nextSector = 1;
  }
  update(progress, time) {
    if (!finite(progress) || !finite(time) || time < 0 || time < this.previous.time || this.finished) return [];
    const events = [];
    const previous = this.previous;
    if (time === 0 && progress < 0 && this.nextSector === 1) this.previous = { progress, time };
    const delta = progress - previous.progress;
    if (delta > 0) {
      while (this.nextSector <= this.laps * 3) {
        const boundary = this.nextSector * this.length / 3;
        if (progress + 1e-7 < boundary) break;
        const crossingTime = previous.time + (time - previous.time) * clamp((boundary - previous.progress) / delta, 0, 1);
        const sectorTime = Math.max(0, crossingTime - this.lastSplitTime);
        const lap = Math.ceil(this.nextSector / 3), sector = (this.nextSector - 1) % 3 + 1;
        this.sectorTimes.push(sectorTime);
        this.splits.push(crossingTime);
        this.lastSplitTime = crossingTime;
        events.push({ type: 'sector', lap, sector, time: crossingTime, sectorTime, progress: boundary, delta: this.deltaGhost(boundary, crossingTime) });
        if (sector === 3) {
          const lapTime = Math.max(0, crossingTime - this.lastLapTime);
          this.lapTimes.push(lapTime);
          this.completedLaps = lap;
          this.lastLapTime = crossingTime;
          events.push({ type: 'lap', lap, time: crossingTime, lapTime, progress: boundary, delta: this.deltaGhost(boundary, crossingTime) });
        }
        this.nextSector++;
        if (this.nextSector > this.laps * 3) this.finished = true;
      }
    }
    this.previous = { progress, time };
    return events;
  }
  deltaGhost(progress, time = this.previous.time) {
    const ghostTime = this.ghost?.timeAtProgress(progress);
    return ghostTime == null || !finite(time) ? null : time - ghostTime;
  }
}

function readCup(raw) {
  if (!raw || raw.length > 64_000) return null;
  const state = JSON.parse(raw);
  if (state?.version !== 1 || !['active', 'completed'].includes(state.status) || !Array.isArray(state.entrants) || state.entrants.length !== 6 || !Array.isArray(state.races) || state.races.length > 3) return null;
  const ids = state.entrants.map(entrant => entrant?.id);
  if (new Set(ids).size !== 6 || ids.some(id => typeof id !== 'string' || !id || id.length > 64)) return null;
  for (let index = 0; index < state.races.length; index++) {
    const race = state.races[index];
    if (race?.trackId !== CUP_TRACKS[index] || !Array.isArray(race.results) || race.results.length !== 6) return null;
    const raceIds = race.results.map(result => result?.id);
    if (new Set(raceIds).size !== 6 || raceIds.some(id => !ids.includes(id))) return null;
    race.results.forEach((result, place) => { result.position = place + 1; result.points = CUP_POINTS[place]; });
  }
  if (state.index !== state.races.length || (state.status === 'completed') !== (state.races.length === 3)) return null;
  state.tracks = [...CUP_TRACKS];
  state.config = canonical(state.config ?? {});
  return state;
}

export class BreuerCup {
  constructor(storage) {
    this.storage = storage;
    this.state = null;
    this.lastError = null;
  }
  _persist() {
    try {
      if (typeof this.storage?.setItem !== 'function') throw new Error('Storage unavailable');
      this.storage.setItem(CUP_KEY, JSON.stringify(this.state));
      this.lastError = null;
      return true;
    } catch {
      this.lastError = 'Der Cup-Fortschritt bleibt für diese Sitzung verfügbar.';
      return false;
    }
  }
  start(config = {}, entrants = []) {
    const names = ['Du', 'Max', 'Nina', 'Ben', 'Lea', 'Tom'];
    const used = new Set();
    const drivers = [];
    for (let index = 0; index < 6; index++) {
      const entrant = entrants[index] ?? {};
      let id = safeText(entrant.id, index === 0 ? 'you' : `cup-bot-${index}`);
      if (!id || used.has(id)) id = `cup-driver-${index}`;
      while (used.has(id)) id += '-';
      used.add(id);
      drivers.push({ id, name: safeText(entrant.name, names[index], 24), car: entrant.car ?? (index === 0 ? config.car ?? 0 : index % CARS.length), isHuman: index === 0 || !!entrant.isHuman });
    }
    const now = Date.now();
    this.state = {
      version: 1, id: now.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      status: 'active', config: canonical(config), tracks: [...CUP_TRACKS], entrants: drivers,
      index: 0, races: [], startedAt: now, updatedAt: now
    };
    this._persist();
    return this.state;
  }
  resume() {
    if (this.state) return this.state;
    try { this.state = readCup(this.storage?.getItem(CUP_KEY)); }
    catch { this.state = null; }
    return this.state;
  }
  standings() {
    if (!this.state) return [];
    const scores = new Map(this.state.entrants.map(entrant => [entrant.id, { ...entrant, points: 0, wins: 0, positions: Array(6).fill(0), totalTime: 0, races: 0 }]));
    for (const race of this.state.races) {
      for (const result of race.results) {
        const driver = scores.get(result.id);
        if (!driver) continue;
        driver.points += CUP_POINTS[result.position - 1];
        driver.positions[result.position - 1]++;
        if (result.position === 1) driver.wins++;
        if (finite(result.time) && result.time > 0) driver.totalTime += result.time;
        driver.races++;
      }
    }
    return [...scores.values()].sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      for (let place = 0; place < 6; place++) if (a.positions[place] !== b.positions[place]) return b.positions[place] - a.positions[place];
      return a.totalTime - b.totalTime || a.id.localeCompare(b.id);
    }).map((driver, index) => ({ ...driver, position: index + 1 }));
  }
  recordRace(trackId, ranking) {
    const state = this.state ?? this.resume();
    if (!state) return { ok: false, error: 'Kein aktiver Cup.', nextTrack: null, completed: false, standings: [] };
    const already = state.races.some(race => race.trackId === trackId);
    if (already) return { ok: true, duplicate: true, saved: !this.lastError, state, nextTrack: CUP_TRACKS[state.index] ?? null, completed: state.status === 'completed', standings: this.standings(), error: this.lastError };
    if (state.status !== 'active' || trackId !== CUP_TRACKS[state.index]) return { ok: false, error: 'Diese Strecke ist im Cup noch nicht dran.', state, nextTrack: CUP_TRACKS[state.index] ?? null, completed: state.status === 'completed', standings: this.standings() };
    const ids = state.entrants.map(entrant => entrant.id);
    const entries = Array.isArray(ranking) ? ranking : [];
    const ordered = entries.map(entry => typeof entry === 'string' ? { id: entry } : entry);
    if (ordered.length !== 6 || new Set(ordered.map(entry => entry?.id)).size !== 6 || ordered.some(entry => !ids.includes(entry?.id))) return { ok: false, error: 'Die Cup-Wertung braucht alle sechs Fahrer.', state, nextTrack: CUP_TRACKS[state.index], completed: false, standings: this.standings() };
    const results = ordered.map((entry, index) => ({
      id: entry.id, position: index + 1, points: CUP_POINTS[index],
      time: finite(entry.finish ?? entry.time ?? entry.estimatedFinish) && (entry.finish ?? entry.time ?? entry.estimatedFinish) > 0 ? (entry.finish ?? entry.time ?? entry.estimatedFinish) : null
    }));
    state.races.push({ trackId, results });
    state.index = state.races.length;
    state.status = state.index === CUP_TRACKS.length ? 'completed' : 'active';
    state.updatedAt = Date.now();
    const saved = this._persist();
    return { ok: true, saved, state, nextTrack: CUP_TRACKS[state.index] ?? null, completed: state.status === 'completed', standings: this.standings(), error: this.lastError };
  }
  abandon() {
    this.state = null;
    return this._persist();
  }
}

export const LAMMERSDORF_MEDAL_TIMES = Object.freeze({gold:35,silver:40,bronze:50});

/**
 * Designer-set challenge goals, shared by every car. Lammersdorf keeps its
 * explicit 35/40/50-second lap; other courses scale against its mapped length.
 * These goals are not a measured claim about what the AI or a player can reach.
 * Round each lap to the same hundredths shown in the UI before multiplying it,
 * so five laps always mean exactly five of the displayed one-lap targets.
 */
export function medalTargets(trackMeta, options = {}) {
  const config=options&&typeof options==='object'&&!Array.isArray(options)?options:{};
  const meta=trackMeta&&typeof trackMeta==='object'?trackMeta:{};
  const id=typeof trackMeta==='string'?trackMeta:meta.id??meta.trackId??config.trackId;
  const base=TRACKS.find(track=>track.id==='lammersdorf');
  const known=TRACKS.find(track=>track.id===id);
  const candidate=Number(meta.length??meta.routeLength??known?.length);
  const length=finite(candidate)&&candidate>0?candidate:known?.length??base.length;
  const ratio=id==='lammersdorf'?1:length/base.length;
  const count=lapCount(config.laps);
  const hundredths=value=>Math.round(value*100)/100;
  return Object.fromEntries(Object.entries(LAMMERSDORF_MEDAL_TIMES).map(([award,seconds])=>[
    award,hundredths(hundredths(seconds*ratio)*count)
  ]));
}

/** Existing controller call shape; car choice never changes the stated goals. */
export function challengeTargets(trackMeta = {}, _car = {}, laps = 1) {
  return medalTargets(trackMeta,{laps});
}

export function medal(time, targets) {
  if (!finite(time) || time <= 0 || !targets) return null;
  if (finite(targets.gold) && time <= targets.gold) return 'gold';
  if (finite(targets.silver) && time <= targets.silver) return 'silver';
  if (finite(targets.bronze) && time <= targets.bronze) return 'bronze';
  return null;
}

/** Frame measurements only: renderer memory reports resource counts, never byte estimates. */
export class PerformanceProbe {
  constructor({ windowSeconds = 10, targetFPS = 60, maxSamples = 4096 } = {}) {
    this.windowMs = clamp(Number(windowSeconds) || 10, 1, 120) * 1000;
    this.targetFPS = clamp(Number(targetFPS) || 60, 15, 240);
    this.maxSamples = clamp(Math.floor(Number(maxSamples) || 4096), 60, 30000);
    this.reset();
  }
  reset() {
    this.samples = [];
    this.head = 0;
    this.clock = 0;
    this.totalFrames = 0;
    this.baseline = null;
    return this;
  }
  sample(frameMs, rendererInfo = {}, targetFPS = this.targetFPS) {
    if (!finite(frameMs) || frameMs <= 0) return false;
    this.targetFPS = finite(targetFPS) ? clamp(targetFPS, 15, 240) : this.targetFPS;
    this.clock += frameMs;
    this.totalFrames++;
    const count = value => finite(value) ? Math.max(0, value) : 0;
    const sample = {
      at: this.clock, frameMs, targetFPS: this.targetFPS, calls: count(rendererInfo.render?.calls), triangles: count(rendererInfo.render?.triangles),
      geometries: count(rendererInfo.memory?.geometries), textures: count(rendererInfo.memory?.textures),
      programs: Array.isArray(rendererInfo.programs) ? rendererInfo.programs.length : count(rendererInfo.programs)
    };
    if (!this.baseline) this.baseline = { geometries: sample.geometries, textures: sample.textures, programs: sample.programs };
    this.samples.push(sample);
    while (this.head < this.samples.length - 1 && (this.samples[this.head].at <= this.clock - this.windowMs || this.samples.length - this.head > this.maxSamples)) this.head++;
    if (this.head > 2048 && this.head > this.samples.length / 2) {
      this.samples = this.samples.slice(this.head);
      this.head = 0;
    }
    return true;
  }
  summary() {
    const samples = this.samples.slice(this.head), frames = samples.length;
    if (!frames) return { frames: 0, seconds: 0, fps: 0, meanMs: 0, p95Ms: 0, minMs: 0, maxMs: 0, droppedFrames: 0, slowFrames: 0, drawCalls: 0, triangles: 0, maxDrawCalls: 0, maxTriangles: 0, geometries: 0, textures: 0, programs: 0, geometryDelta: 0, textureDelta: 0, programDelta: 0, totalFrames: 0, totalSeconds: 0, overallFPS: 0, targetFPS: this.targetFPS };
    const times = samples.map(sample => sample.frameMs).sort((a, b) => a - b);
    const milliseconds = samples.reduce((sum, sample) => sum + sample.frameMs, 0);
    const latest = samples[frames - 1];
    let droppedFrames = 0, slowFrames = 0, calls = 0, triangles = 0, maxDrawCalls = 0, maxTriangles = 0;
    for (const sample of samples) {
      const budget = 1000 / sample.targetFPS;
      droppedFrames += Math.max(0, Math.round(sample.frameMs / budget) - 1);
      if (sample.frameMs > budget * 1.2) slowFrames++;
      calls += sample.calls;
      triangles += sample.triangles;
      maxDrawCalls = Math.max(maxDrawCalls, sample.calls);
      maxTriangles = Math.max(maxTriangles, sample.triangles);
    }
    return {
      frames, seconds: milliseconds / 1000, fps: frames * 1000 / milliseconds,
      meanMs: milliseconds / frames, p95Ms: times[Math.ceil(frames * .95) - 1], minMs: times[0], maxMs: times[frames - 1],
      droppedFrames, slowFrames, drawCalls: Math.round(calls / frames), triangles: Math.round(triangles / frames), maxDrawCalls, maxTriangles,
      geometries: latest.geometries, textures: latest.textures, programs: latest.programs,
      geometryDelta: latest.geometries - this.baseline.geometries, textureDelta: latest.textures - this.baseline.textures, programDelta: latest.programs - this.baseline.programs,
      latestDrawCalls: latest.calls, latestTriangles: latest.triangles,
      totalFrames: this.totalFrames, totalSeconds: this.clock / 1000, overallFPS: this.totalFrames * 1000 / this.clock, targetFPS: this.targetFPS
    };
  }
}
