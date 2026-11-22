// AquesTalk専用エンジン (Unicorn CPUコア + 必要APIのみの専用ローダー)
// 純正 AquesTalk2.dll などの Windows x86 DLL をブラウザ内で直接実行する。
// 本アプリは Aquestalkのプログラムを使用しています。
// Unicorn Engine は GPLv2 (https://github.com/unicorn-engine/unicorn)。
//
// 使い方:
//   const aq = await loadAquesTalkUC({ dll: ArrayBuffer|Uint8Array, phont: ArrayBuffer|Uint8Array|null })
//   const wav = aq.run(koeString, speed)  // -> Uint8Array (WAV)

let ucModulePromise = null

async function getUcModule(unicornUrl) {
  if (!ucModulePromise) {
    ucModulePromise = (async () => {
      const res = await fetch(unicornUrl)
      if (!res.ok) throw new Error('unicorn_x86.js の読み込みに失敗しました')
      const code = await res.text()
      const factory = new Function(code + '\n;return MUnicorn;')()
      return await factory()
    })()
  }
  return ucModulePromise
}

function parsePE(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const peOff = dv.getUint32(0x3c, true)
  const nSec = dv.getUint16(peOff + 6, true)
  const optSize = dv.getUint16(peOff + 20, true)
  const opt = peOff + 24
  const entryRVA = dv.getUint32(opt + 16, true)
  const expRVA = dv.getUint32(opt + 96, true)
  const impRVA = dv.getUint32(opt + 96 + 8, true)
  const secs = []
  for (let i = 0; i < nSec; i++) {
    const o = opt + optSize + i * 40
    secs.push({ va: dv.getUint32(o + 12, true), vs: dv.getUint32(o + 8, true), rp: dv.getUint32(o + 20, true), rs: dv.getUint32(o + 16, true) })
  }
  const r2o = (rva) => { for (const s of secs) if (rva >= s.va && rva < s.va + Math.max(s.vs, s.rs)) return s.rp + (rva - s.va); return rva }
  const readStr = (off) => { let e = off; while (buf[e] !== 0) e++; return new TextDecoder('ascii').decode(buf.subarray(off, e)) }
  const exportsMap = {}
  if (expRVA) {
    const eo = r2o(expRVA)
    const nNames = dv.getUint32(eo + 24, true)
    const fOff = r2o(dv.getUint32(eo + 28, true)), nOff = r2o(dv.getUint32(eo + 32, true)), oOff = r2o(dv.getUint32(eo + 36, true))
    for (let i = 0; i < nNames; i++) {
      const name = readStr(r2o(dv.getUint32(nOff + i * 4, true)))
      exportsMap[name] = dv.getUint32(fOff + dv.getUint16(oOff + i * 2, true) * 4, true)
    }
  }
  const imports = []
  if (impRVA) {
    let o = r2o(impRVA)
    while (dv.getUint32(o + 12, true) !== 0) {
      const oft = dv.getUint32(o, true), ft = dv.getUint32(o + 16, true)
      let idx = 0
      while (true) {
        const v = dv.getUint32(r2o(oft || ft) + idx * 4, true)
        if (v === 0) break
        if (!(v & 0x80000000)) imports.push({ name: readStr(r2o(v) + 2), iatRVA: ft + idx * 4 })
        idx++
      }
      o += 20
    }
  }
  return { entryRVA, exportsMap, imports, secs }
}

const BASE = 0x10000000, HEAP = 0x20000000, STACK = 0x30000000, STUB = 0x80000, SENTINEL = 0x90000
// MSVCRT関数は cdecl (0)、Win32 API は stdcall (引数バイト数)
const argBytes = {
  malloc: 0, free: 0, memcpy: 0, memmove: 0, memset: 0, _initterm: 0, _initterm_e: 0,
  strncmp: 0, strncpy: 0, strtok: 0, strchr: 0, _stricmp: 0, stricmp: 0, strlen: 0, __CxxFrameHandler: 0,
  DisableThreadLibraryCalls: 4, LoadLibraryExW: 12, GetLastError: 0, QueryPerformanceCounter: 4,
  IsProcessorFeaturePresent: 4, InitializeCriticalSectionAndSpinCount: 8, InitializeCriticalSectionEx: 12,
  GetSystemTimeAsFileTime: 4, GetCurrentThreadId: 0, GetCurrentProcessId: 0, GetProcessHeap: 0,
  HeapAlloc: 12, HeapFree: 12, HeapCreate: 12, HeapSize: 12, TlsAlloc: 0, TlsGetValue: 4, TlsSetValue: 8, TlsFree: 4,
  FlsAlloc: 4, FlsGetValue: 4, FlsSetValue: 8, FlsFree: 4, InitializeCriticalSection: 4, EnterCriticalSection: 4,
  LeaveCriticalSection: 4, DeleteCriticalSection: 4, GetModuleHandleW: 4, GetModuleHandleA: 4, GetProcAddress: 8,
  VirtualProtect: 16, VirtualAlloc: 16, VirtualFree: 12, SetLastError: 4, InterlockedIncrement: 4,
  InterlockedDecrement: 4, InterlockedExchange: 8, Sleep: 4, GetTickCount: 0, GetACP: 0, IsValidCodePage: 4,
  GetCPInfo: 8, MultiByteToWideChar: 24, WideCharToMultiByte: 32, IsDebuggerPresent: 0, OutputDebugStringW: 4,
  OutputDebugStringA: 4, RaiseException: 16, RtlUnwind: 16, UnhandledExceptionFilter: 4,
  SetUnhandledExceptionFilter: 4, EncodePointer: 4, DecodePointer: 4, GetModuleFileNameW: 12,
  GetModuleFileNameA: 12, ExitProcess: 4, TerminateProcess: 8, HeapSetInformation: 16, HeapDestroy: 4,
  GetStartupInfoW: 4, GetFileType: 4, GetStdHandle: 4, WriteFile: 20, CreateFileW: 28,
}

class AquesTalkUC {
  constructor(uc, dllBytes, phontBytes) {
    this.uc = uc
    const dll = dllBytes instanceof Uint8Array ? dllBytes : new Uint8Array(dllBytes)
    const pe = parsePE(dll)
    this.pe = pe
    const e = new uc.Unicorn(uc.ARCH_X86, uc.MODE_32)
    this.e = e
    e.mem_map(0, 0x100000, uc.PROT_ALL)
    e.mem_map(BASE, 0x100000, uc.PROT_ALL)
    e.mem_map(HEAP, 0x2000000, uc.PROT_ALL)
    e.mem_map(STACK, 0x200000, uc.PROT_ALL)
    e.mem_write(BASE, dll.subarray(0, 0x1000))
    for (const s of pe.secs) if (s.rs > 0) e.mem_write(BASE + s.va, dll.subarray(s.rp, s.rp + s.rs))
    this.heapPtr = HEAP
    this.tlsIndex = 0
    this.tlsStore = new Map()
    const stubByAddr = new Map()
    this.stubByAddr = stubByAddr
    let stubIdx = 0
    const dvw = new DataView(new ArrayBuffer(4))
    for (const imp of pe.imports) {
      if (imp.name === '_adjust_fdiv') {
        const cell = this.malloc(4)
        dvw.setUint32(0, cell, true)
        e.mem_write(BASE + imp.iatRVA, new Uint8Array(dvw.buffer))
        continue
      }
      const addr = STUB + stubIdx * 16
      stubByAddr.set(addr, imp.name)
      dvw.setUint32(0, addr, true)
      e.mem_write(BASE + imp.iatRVA, new Uint8Array(dvw.buffer))
      e.mem_write(addr, new Uint8Array([0xcc]))
      stubIdx++
    }
    this.stoppedAtStub = 0
    e.hook_add(uc.HOOK_CODE, (h, addr) => { this.stoppedAtStub = Number(addr); e.emu_stop() }, {}, STUB, STUB + 0x10000)
    // phont
    this.phontAddr = 0
    if (phontBytes) {
      const pb = phontBytes instanceof Uint8Array ? phontBytes : new Uint8Array(phontBytes)
      this.phontAddr = this.malloc(pb.length)
      e.mem_write(this.phontAddr, pb)
    }
    // DllMain
    if (pe.entryRVA) {
      this.setupStack([BASE, 1, 0])
      this.runToSentinel(BASE + pe.entryRVA)
    }
    this.syntheRVA = pe.exportsMap['AquesTalk2_Synthe'] || pe.exportsMap['AquesTalk_Synthe']
    if (!this.syntheRVA) throw new Error('Synthe 関数が見つかりません')
    this.isAq2 = !!pe.exportsMap['AquesTalk2_Synthe']
  }
  malloc(n) { const p = this.heapPtr; this.heapPtr += Math.max(16, (n + 15) & ~15); return p }
  readU32(a) { const b = this.e.mem_read(a, 4); return new DataView(b.buffer, b.byteOffset).getUint32(0, true) }
  writeU32(a, v) { const b = new ArrayBuffer(4); new DataView(b).setUint32(0, v >>> 0, true); this.e.mem_write(a, new Uint8Array(b)) }
  readByte(a) { return this.e.mem_read(a, 1)[0] }
  serviceImport(name) {
    const e = this.e, uc = this.uc
    const esp = e.reg_read_i32(uc.X86_REG_ESP)
    const retAddr = this.readU32(esp)
    const arg = (i) => this.readU32(esp + 4 + i * 4)
    let eax = 0
    if (name === 'malloc') eax = this.malloc(arg(0))
    else if (name === 'free') eax = 0
    else if (name === 'memcpy' || name === 'memmove') { const d = arg(0), s2 = arg(1), n = arg(2); if (n) e.mem_write(d, e.mem_read(s2, n)); eax = d }
    else if (name === 'memset') { const d = arg(0), v = arg(1), n = arg(2); if (n) e.mem_write(d, new Uint8Array(n).fill(v & 0xff)); eax = d }
    else if (name === '_initterm' || name === '_initterm_e') {
      const begin = arg(0), end = arg(1)
      for (let p = begin; p < end; p += 4) {
        const fn = this.readU32(p)
        if (fn) {
          let esp2 = STACK + 0x80000
          esp2 -= 4; this.writeU32(esp2, SENTINEL)
          e.reg_write_i32(uc.X86_REG_ESP, esp2)
          this.runToSentinel(fn)
        }
      }
      eax = 0
    }
    else if (name === 'strlen') { let p = arg(0); while (this.readByte(p) !== 0) p++; eax = p - arg(0) }
    else if (name === 'strchr') { let p = arg(0); const c = arg(1) & 0xff; eax = 0; while (true) { const b = this.readByte(p); if (b === c) { eax = p; break } if (b === 0) break; p++ } }
    else if (name === 'strncmp') { const a = arg(0), b = arg(1), n = arg(2); eax = 0; for (let i = 0; i < n; i++) { const x = this.readByte(a + i), y = this.readByte(b + i); if (x !== y) { eax = x - y; break } if (x === 0) break } }
    else if (name === 'strncpy') { const d = arg(0), s2 = arg(1), n = arg(2); const out = new Uint8Array(n); for (let i = 0; i < n; i++) { const b = this.readByte(s2 + i); out[i] = b; if (b === 0) break } e.mem_write(d, out); eax = d }
    else if (name === '_stricmp' || name === 'stricmp') { const a = arg(0), b = arg(1); eax = 0; for (let i = 0; ; i++) { const x = this.readByte(a + i), y = this.readByte(b + i); const lx = x >= 65 && x <= 90 ? x + 32 : x, ly = y >= 65 && y <= 90 ? y + 32 : y; if (lx !== ly) { eax = lx - ly; break } if (x === 0) break } }
    else if (name === 'GetProcessHeap' || name === 'HeapCreate') eax = 0x11110000
    else if (name === 'HeapAlloc') eax = this.malloc(arg(2))
    else if (name === 'HeapFree' || name === 'HeapDestroy') eax = 1
    else if (name === 'HeapSize') eax = 0x10000
    else if (name === 'HeapSetInformation') eax = 1
    else if (name === 'TlsAlloc' || name === 'FlsAlloc') { this.tlsIndex++; eax = this.tlsIndex }
    else if (name === 'TlsGetValue' || name === 'FlsGetValue') eax = this.tlsStore.get(arg(0)) || 0
    else if (name === 'TlsSetValue' || name === 'FlsSetValue') { this.tlsStore.set(arg(0), arg(1)); eax = 1 }
    else if (name === 'TlsFree' || name === 'FlsFree') eax = 1
    else if (name === 'InitializeCriticalSection' || name === 'InitializeCriticalSectionAndSpinCount' || name === 'InitializeCriticalSectionEx' || name === 'EnterCriticalSection' || name === 'LeaveCriticalSection' || name === 'DeleteCriticalSection') eax = 1
    else if (name === 'LoadLibraryExW' || name === 'LoadLibraryW' || name === 'LoadLibraryA') eax = 0
    else if (name === 'GetModuleHandleW' || name === 'GetModuleHandleA') eax = BASE
    else if (name === 'GetProcAddress') eax = 0
    else if (name === 'GetLastError' || name === 'SetLastError') eax = 0
    else if (name === 'QueryPerformanceCounter') { this.writeU32(arg(0), 1000000); this.writeU32(arg(0) + 4, 0); eax = 1 }
    else if (name === 'IsProcessorFeaturePresent') eax = 0
    else if (name === 'GetSystemTimeAsFileTime') { this.writeU32(arg(0), 0xE0000000); this.writeU32(arg(0) + 4, 0x01DB0000); eax = 0 }
    else if (name === 'GetCurrentThreadId' || name === 'GetCurrentProcessId') eax = 1
    else if (name === 'VirtualProtect') { if (arg(3)) this.writeU32(arg(3), 0x04); eax = 1 }
    else if (name === 'VirtualAlloc') eax = this.malloc(arg(1))
    else if (name === 'VirtualFree') eax = 1
    else if (name === 'InterlockedIncrement') { const v = this.readU32(arg(0)) + 1; this.writeU32(arg(0), v); eax = v }
    else if (name === 'InterlockedDecrement') { const v = this.readU32(arg(0)) - 1; this.writeU32(arg(0), v); eax = v }
    else if (name === 'InterlockedExchange') { const old = this.readU32(arg(0)); this.writeU32(arg(0), arg(1)); eax = old }
    else if (name === 'Sleep') eax = 0
    else if (name === 'GetTickCount') eax = 100000
    else if (name === 'GetACP') eax = 932
    else if (name === 'IsValidCodePage') eax = 1
    else if (name === 'IsDebuggerPresent') eax = 0
    else if (name === 'EncodePointer' || name === 'DecodePointer') eax = arg(0)
    else if (name === 'CreateFileW') eax = 0xFFFFFFFF
    else eax = 0
    e.reg_write_i32(uc.X86_REG_EAX, eax)
    e.reg_write_i32(uc.X86_REG_ESP, esp + 4 + (argBytes[name] ?? 0))
    return retAddr
  }
  runToSentinel(from) {
    let pc = from
    for (let iter = 0; iter < 200000; iter++) {
      this.stoppedAtStub = 0
      this.e.emu_start(pc, SENTINEL, 0, 0)
      if (!this.stoppedAtStub) return
      pc = this.serviceImport(this.stubByAddr.get(this.stoppedAtStub))
    }
    throw new Error('emulation runaway')
  }
  setupStack(args) {
    let esp = STACK + 0x100000 - 16
    const push = (v) => { esp -= 4; this.writeU32(esp, v) }
    for (let i = args.length - 1; i >= 0; i--) push(args[i])
    push(SENTINEL)
    this.e.reg_write_i32(this.uc.X86_REG_ESP, esp)
  }
  run(koe, speed) {
    const e = this.e
    const koeBytes = new Uint8Array([...Encoding.convert(Encoding.stringToCode(koe), 'SJIS'), 0])
    const koeAddr = this.malloc(koeBytes.length)
    e.mem_write(koeAddr, koeBytes)
    const sizeAddr = this.malloc(4)
    this.writeU32(sizeAddr, 0)
    const args = this.isAq2 ? [koeAddr, speed | 0, sizeAddr, this.phontAddr] : [koeAddr, speed | 0, sizeAddr]
    this.setupStack(args)
    this.runToSentinel(BASE + this.syntheRVA)
    const eax = e.reg_read_i32(this.uc.X86_REG_EAX)
    const size = this.readU32(sizeAddr)
    if (!eax || size <= 44) throw new Error('合成に失敗しました (size=' + size + ')')
    return e.mem_read(eax, size)
  }
}

let Encoding = null

export async function loadAquesTalkUC(options) {
  const base = options.baseUrl || new URL('.', import.meta.url).href
  const uc = await getUcModule(options.unicornUrl || (base + 'unicorn_x86.js'))
  if (!Encoding) {
    const mod = await import(options.encodingUrl || (base + '../deps/encoding-japanese.js'))
    Encoding = mod.default || mod
  }
  return new AquesTalkUC(uc, options.dll, options.phont || null)
}
