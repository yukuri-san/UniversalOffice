var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _AquesTalk_instances, _AquesTalk_mode, _AquesTalk_phontAddress, _AquesTalk_dllImage, _AquesTalk_writableSections, _AquesTalk_emu, _AquesTalk_baseAddress, _AquesTalk_aquesTalk_SyntheAddress, _AquesTalk_adjustFdivTargetAddress, _AquesTalk_returnAddress, _AquesTalk_stackTop, _AquesTalk_heap, _AquesTalk_reset_esp, _AquesTalk_init, _AquesTalk_reset, _AquesTalk_reset_writable_sections;
import JSZip from "../../deps/jszip.js";
import { V86Emu, REG_EAX, REG_ESP } from "./v86_emu.js";
import { call, push } from "./x86_util.js";
import { convert_sjis } from "./util.js";
import { free_hook, malloc_hook } from "./clib_hook.js";
import { Heap, NOP, align_to_0x1000, hook_lib_call, reg_read_uint32, reg_write_uint32, } from "./emu_util.js";
import { parsePE } from "./pe.js";
import { NATIVE_CLIB_BIN, NATIVE_CLIB_SYMBOLS } from "./native_code.js";
const VOICE_MAP = {
    dvd: {
        zip: new URL("../voices/dvd.zip", import.meta.url),
        dll: "dvd/AquesTalk.dll",
    },
    f1: {
        zip: new URL("../voices/f1.zip", import.meta.url),
        dll: "f1/AquesTalk.dll",
    },
    f2: {
        zip: new URL("../voices/f2.zip", import.meta.url),
        dll: "f2/AquesTalk.dll",
    },
    imd1: {
        zip: new URL("../voices/imd1.zip", import.meta.url),
        dll: "imd1/AquesTalk.dll",
    },
    jgr: {
        zip: new URL("../voices/jgr.zip", import.meta.url),
        dll: "jgr/AquesTalk.dll",
    },
    m1: {
        zip: new URL("../voices/m1.zip", import.meta.url),
        dll: "m1/AquesTalk.dll",
    },
    m2: {
        zip: new URL("../voices/m2.zip", import.meta.url),
        dll: "m2/AquesTalk.dll",
    },
    r1: {
        zip: new URL("../voices/r1.zip", import.meta.url),
        dll: "r1/AquesTalk.dll",
    },
};
const WASM_URL = new URL("../voices/v86.wasm", import.meta.url);
// The bundled DLL accepts up to 4094 Shift-JIS bytes. At the slowest speed,
// all voices synthesize that engine boundary within this heap while retaining
// headroom over the allocator's measured 22.1 MiB high-water mark.
export const DEFAULT_HEAP_SIZE = 32 * 1024 * 1024;
// Keep the relocated image clear of v86's multiboot entry at 1 MiB while
// avoiding the original PE image base's 256 MiB address-space hole.
const DEFAULT_LOAD_ADDRESS = 2 * 1024 * 1024;
const STACK_SIZE = 64 * 1024;
const RETURN_GUARD_SIZE = 1024 * 1024;
const RETURN_SLED_SIZE = 512 * 1024;
const PE_CACHE = new WeakMap();
function inspectPE(file) {
    const cached = PE_CACHE.get(file);
    if (cached)
        return cached;
    const pe = parsePE(file);
    PE_CACHE.set(file, pe);
    return pe;
}
const NATIVE_HOOK_MAP = {
    memcpy: NATIVE_CLIB_SYMBOLS.memcpy,
    strncmp: NATIVE_CLIB_SYMBOLS.strncmp,
    strncpy: NATIVE_CLIB_SYMBOLS.strncpy,
    strtok: NATIVE_CLIB_SYMBOLS.strtok,
    strchr: NATIVE_CLIB_SYMBOLS.strchr,
    stricmp: NATIVE_CLIB_SYMBOLS.stricmp,
    _stricmp: NATIVE_CLIB_SYMBOLS.stricmp,
    _initterm: NATIVE_CLIB_SYMBOLS._initterm,
    initterm: NATIVE_CLIB_SYMBOLS._initterm,
    __CxxFrameHandler: NATIVE_CLIB_SYMBOLS.__CxxFrameHandler,
    DisableThreadLibraryCalls: NATIVE_CLIB_SYMBOLS.DisableThreadLibraryCalls,
};
export class AquesTalk {
    constructor(file, emu, options = {}) {
        _AquesTalk_instances.add(this);
        _AquesTalk_mode.set(this, void 0);
        _AquesTalk_phontAddress.set(this, void 0);
        _AquesTalk_dllImage.set(this, void 0);
        _AquesTalk_writableSections.set(this, void 0);
        _AquesTalk_emu.set(this, void 0);
        _AquesTalk_baseAddress.set(this, 0);
        _AquesTalk_aquesTalk_SyntheAddress.set(this, 0);
        _AquesTalk_adjustFdivTargetAddress.set(this, 0);
        _AquesTalk_returnAddress.set(this, 0);
        _AquesTalk_stackTop.set(this, 0);
        _AquesTalk_heap.set(this, null);
        const pe = inspectPE(file);
        __classPrivateFieldSet(this, _AquesTalk_mode, options.mode ?? "aq1", "f");
        this._yvmPhont = options.phont ?? null;
        const heapSize = options.heapSize ?? DEFAULT_HEAP_SIZE;
        const loadAddress = pe.baseRelocationOffsets.length > 0
            ? DEFAULT_LOAD_ADDRESS
            : pe.baseAddress;
        if (!Number.isSafeInteger(heapSize) || heapSize <= 0) {
            throw new RangeError(`invalid heap size: ${heapSize}`);
        }
        __classPrivateFieldSet(this, _AquesTalk_dllImage, new Uint8Array(file).slice(), "f");
        __classPrivateFieldSet(this, _AquesTalk_emu, emu, "f");
        __classPrivateFieldSet(this, _AquesTalk_baseAddress, loadAddress, "f");
        if (loadAddress !== pe.baseAddress) {
            const delta = loadAddress - pe.baseAddress;
            const imageView = new DataView(__classPrivateFieldGet(this, _AquesTalk_dllImage, "f").buffer, __classPrivateFieldGet(this, _AquesTalk_dllImage, "f").byteOffset, __classPrivateFieldGet(this, _AquesTalk_dllImage, "f").byteLength);
            for (const fileOffset of pe.baseRelocationOffsets) {
                imageView.setUint32(fileOffset, imageView.getUint32(fileOffset, true) + delta, true);
            }
        }
        __classPrivateFieldSet(this, _AquesTalk_writableSections, pe.writableSections.map(section => {
            const rawSize = Math.min(section.rawSize, section.virtualSize);
            return {
                address: loadAddress + section.virtualAddress,
                bytes: __classPrivateFieldGet(this, _AquesTalk_dllImage, "f").subarray(section.pointerToRawData, section.pointerToRawData + rawSize),
                zeroAddress: loadAddress + section.virtualAddress + rawSize,
                zeroSize: Math.max(0, section.virtualSize - rawSize),
            };
        }), "f");
        this.HEAP_ADDRESS = align_to_0x1000(loadAddress + pe.imageSize);
        this.HEAP_LENGTH = heapSize;
        __classPrivateFieldSet(this, _AquesTalk_stackTop, this.HEAP_ADDRESS + heapSize + STACK_SIZE, "f");
        emu.assert_memory_range(loadAddress, __classPrivateFieldGet(this, _AquesTalk_dllImage, "f").byteLength);
        emu.assert_memory_range(this.HEAP_ADDRESS, this.HEAP_LENGTH + STACK_SIZE);
        __classPrivateFieldGet(this, _AquesTalk_instances, "m", _AquesTalk_init).call(this, pe);
    }
    run(koe, speed = 100) {
        const emu = __classPrivateFieldGet(this, _AquesTalk_emu, "f");
        // Reset CPU registers and segments before starting a new run
        emu.reset_cpu();
        __classPrivateFieldGet(this, _AquesTalk_instances, "m", _AquesTalk_reset).call(this);
        try {
            // Only mutable PE sections can hold per-run global state. Reloading the
            // executable and read-only sections copied ~100 KiB unnecessarily.
            __classPrivateFieldGet(this, _AquesTalk_instances, "m", _AquesTalk_reset_writable_sections).call(this);
            // Reset _adjust_fdiv and other low-memory state
            if (__classPrivateFieldGet(this, _AquesTalk_adjustFdivTargetAddress, "f")) {
                emu.mem_write_uint32(__classPrivateFieldGet(this, _AquesTalk_adjustFdivTargetAddress, "f"), 0);
            }
            const size = __classPrivateFieldGet(this, _AquesTalk_heap, "f").allocate_zeroed(emu, 4);
            const sjis = convert_sjis(koe);
            const koeAddress = __classPrivateFieldGet(this, _AquesTalk_heap, "f").allocate(sjis.byteLength + 1);
            emu.mem_write(koeAddress, sjis);
            emu.mem_clear(koeAddress + sjis.byteLength, 1);
            if (__classPrivateFieldGet(this, _AquesTalk_mode, "f") === "aq2") {
                push(emu, __classPrivateFieldGet(this, _AquesTalk_phontAddress, "f"));
                push(emu, size);
                push(emu, koeAddress);
            }
            else if (__classPrivateFieldGet(this, _AquesTalk_mode, "f") === "aq2s") {
                push(emu, __classPrivateFieldGet(this, _AquesTalk_phontAddress, "f"));
                push(emu, size);
                push(emu, speed);
                push(emu, koeAddress);
            }
            else {
                push(emu, size);
                push(emu, speed);
                push(emu, koeAddress);
            }
            emu.set_eip(__classPrivateFieldGet(this, _AquesTalk_returnAddress, "f"));
            call(emu, __classPrivateFieldGet(this, _AquesTalk_aquesTalk_SyntheAddress, "f"));
            try {
                emu.emu_start(emu.get_eip(), __classPrivateFieldGet(this, _AquesTalk_returnAddress, "f"));
            }
            catch (error) {
                console.error(error);
                console.error(`error at: EIP: `, emu.get_eip().toString(16));
                console.error(`error at: ESP:`, reg_read_uint32(emu, REG_ESP).toString(16));
                throw error;
            }
            const sizeValue = emu.mem_read_uint32(size);
            const returnValue = reg_read_uint32(emu, REG_EAX);
            if (returnValue === 0) {
                throw new Error(`AquesTalk_Synthe error. ERROR CODE: ${sizeValue}`);
            }
            return emu.mem_read(returnValue, sizeValue);
        }
        finally {
            __classPrivateFieldGet(this, _AquesTalk_instances, "m", _AquesTalk_reset).call(this);
        }
    }
    /**
     * Destroy the underlying emulator and release resources.
     */
    async destroy() {
        await __classPrivateFieldGet(this, _AquesTalk_emu, "f").destroy();
    }
}
_AquesTalk_mode = new WeakMap(), _AquesTalk_phontAddress = new WeakMap(), _AquesTalk_dllImage = new WeakMap(), _AquesTalk_writableSections = new WeakMap(), _AquesTalk_emu = new WeakMap(), _AquesTalk_baseAddress = new WeakMap(), _AquesTalk_aquesTalk_SyntheAddress = new WeakMap(), _AquesTalk_adjustFdivTargetAddress = new WeakMap(), _AquesTalk_returnAddress = new WeakMap(), _AquesTalk_stackTop = new WeakMap(), _AquesTalk_heap = new WeakMap(), _AquesTalk_instances = new WeakSet(), _AquesTalk_reset_esp = function _AquesTalk_reset_esp() {
    reg_write_uint32(__classPrivateFieldGet(this, _AquesTalk_emu, "f"), REG_ESP, __classPrivateFieldGet(this, _AquesTalk_stackTop, "f"));
}, _AquesTalk_init = function _AquesTalk_init(pe) {
    const emu = __classPrivateFieldGet(this, _AquesTalk_emu, "f");
    __classPrivateFieldSet(this, _AquesTalk_aquesTalk_SyntheAddress, __classPrivateFieldGet(this, _AquesTalk_baseAddress, "f") + (__classPrivateFieldGet(this, _AquesTalk_mode, "f").startsWith("aq2") ? pe.aquesTalk2SyntheRVA : pe.aquesTalkSyntheRVA), "f");
    __classPrivateFieldSet(this, _AquesTalk_adjustFdivTargetAddress, pe.adjustFdivTarget, "f");
    __classPrivateFieldSet(this, _AquesTalk_heap, new Heap(emu, this.HEAP_ADDRESS, this.HEAP_LENGTH), "f");
    const nativeCodeAddress = __classPrivateFieldGet(this, _AquesTalk_heap, "f").set_mem_value(emu, NATIVE_CLIB_BIN);
    if (this._yvmPhont) {
        const pa = __classPrivateFieldGet(this, _AquesTalk_heap, "f").set_mem_value(emu, this._yvmPhont);
        __classPrivateFieldSet(this, _AquesTalk_phontAddress, pa, "f");
    } else {
        __classPrivateFieldSet(this, _AquesTalk_phontAddress, 0, "f");
    }
    // Keep dynamic allocations 1 MiB away from executable helper code. v86's
    // JIT executes beyond the OUT stop instruction. Keep a 512 KiB NOP sled:
    // 256 KiB corrupts warmed output, while this retains a 2x safety margin.
    __classPrivateFieldSet(this, _AquesTalk_returnAddress, __classPrivateFieldGet(this, _AquesTalk_heap, "f").allocate(RETURN_GUARD_SIZE), "f");
    emu.mem_fill(__classPrivateFieldGet(this, _AquesTalk_returnAddress, "f"), RETURN_SLED_SIZE, NOP);
    __classPrivateFieldGet(this, _AquesTalk_heap, "f").preserve_allocations();
    const dllView = new DataView(__classPrivateFieldGet(this, _AquesTalk_dllImage, "f").buffer, __classPrivateFieldGet(this, _AquesTalk_dllImage, "f").byteOffset, __classPrivateFieldGet(this, _AquesTalk_dllImage, "f").byteLength);
    for (const [name, offset] of Object.entries(NATIVE_HOOK_MAP)) {
        const info = pe.iatHooks[name];
        if (info)
            dllView.setUint32(info.rva, nativeCodeAddress + offset, true);
    }
    emu.mem_write(__classPrivateFieldGet(this, _AquesTalk_baseAddress, "f"), __classPrivateFieldGet(this, _AquesTalk_dllImage, "f"));
    __classPrivateFieldGet(this, _AquesTalk_instances, "m", _AquesTalk_reset_esp).call(this);
    const hookMap = {
        malloc: malloc_hook,
        free: free_hook,
    };
    for (const [name, info] of Object.entries(pe.iatHooks)) {
        if (hookMap[name]) {
            const callback = name === "malloc"
                ? (hookEmu, size) => __classPrivateFieldGet(this, _AquesTalk_heap, "f").try_allocate_zeroed(hookEmu, size)
                : name === "free"
                    ? (_hookEmu, address) => __classPrivateFieldGet(this, _AquesTalk_heap, "f").free(address)
                    : undefined;
            // We hook at the info.target address which is the unlinked address value from IAT.
            // The DLL code jumps to this address when calling imports.
            hook_lib_call(emu, info.target, hookMap[name], callback);
        }
    }
    if (__classPrivateFieldGet(this, _AquesTalk_adjustFdivTargetAddress, "f")) {
        emu.mem_write_uint32(__classPrivateFieldGet(this, _AquesTalk_adjustFdivTargetAddress, "f"), 0);
    }
}, _AquesTalk_reset = function _AquesTalk_reset() {
    __classPrivateFieldGet(this, _AquesTalk_heap, "f").reset_allocations();
    reg_write_uint32(__classPrivateFieldGet(this, _AquesTalk_emu, "f"), REG_EAX, 0);
    __classPrivateFieldGet(this, _AquesTalk_instances, "m", _AquesTalk_reset_esp).call(this);
}, _AquesTalk_reset_writable_sections = function _AquesTalk_reset_writable_sections() {
    for (const section of __classPrivateFieldGet(this, _AquesTalk_writableSections, "f")) {
        __classPrivateFieldGet(this, _AquesTalk_emu, "f").mem_write(section.address, section.bytes);
        if (section.zeroSize > 0) {
            __classPrivateFieldGet(this, _AquesTalk_emu, "f").mem_clear(section.zeroAddress, section.zeroSize);
        }
    }
};
/**
 * Load AquesTalk by voice name (e.g., "f1").
 * Automatic asset resolution using static new URL().
 */
export async function load(voice, options = {}) {
    const { zip, dll } = VOICE_MAP[voice];
    const { baseUrl, ...loadOptions } = options;
    const zipPath = baseUrl
        ? new URL(VOICE_MAP[voice].zip.pathname.split("/").pop(), baseUrl)
            .href
        : zip.href;
    let wasmPath = loadOptions.wasmPath ??
        (baseUrl ? new URL("v86.wasm", baseUrl).href : WASM_URL.href);
    // Convert to local path if Node.js to avoid fetch/URL issues in v86
    if (typeof process !== "undefined" &&
        process.versions &&
        process.versions.node &&
        wasmPath.startsWith("file://")) {
        const { fileURLToPath } = await import("url");
        wasmPath = fileURLToPath(wasmPath);
    }
    return loadAquesTalk(zipPath, dll, { ...loadOptions, wasmPath });
}
async function getData(url) {
    const urlStr = url.toString();
    if (typeof process !== "undefined" &&
        process.versions &&
        process.versions.node &&
        (urlStr.startsWith("file://") || !urlStr.includes("://"))) {
        const fs = await import("fs/promises");
        const { fileURLToPath } = await import("url");
        const filePath = urlStr.startsWith("file://")
            ? fileURLToPath(urlStr)
            : urlStr;
        return fs.readFile(filePath);
    }
    const response = await fetch(urlStr);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${urlStr}: ${response.status}`);
    }
    return response.arrayBuffer();
}
export async function loadAquesTalk(zippath, dllpath, options = {}) {
    const zip = new JSZip();
    const zipbin = await getData(zippath);
    const ziproot = await zip.loadAsync(zipbin);
    const dllfile = await ziproot.files[dllpath].async("arraybuffer");
    let phont = null;
    if (options.phontPath) {
        phont = new Uint8Array(await ziproot.files[options.phontPath].async("arraybuffer"));
    }
    const pe = inspectPE(dllfile);
    const heapSize = options.heapSize ?? DEFAULT_HEAP_SIZE;
    const loadAddress = pe.baseRelocationOffsets.length > 0 ? DEFAULT_LOAD_ADDRESS : pe.baseAddress;
    if (!Number.isSafeInteger(heapSize) || heapSize <= 0) {
        throw new RangeError(`invalid heap size: ${heapSize}`);
    }
    const minimumMemorySize = align_to_0x1000(align_to_0x1000(loadAddress + pe.imageSize) + heapSize + STACK_SIZE);
    const memorySize = options.memorySize ?? minimumMemorySize;
    if (!Number.isSafeInteger(memorySize) ||
        memorySize <= 0 ||
        memorySize > 4294967295) {
        throw new RangeError(`invalid memory size: ${memorySize}`);
    }
    if (memorySize < minimumMemorySize) {
        throw new RangeError(`memory size ${memorySize} is smaller than the required ${minimumMemorySize} bytes`);
    }
    const emu = new V86Emu();
    try {
        await emu.init({ ...options, memorySize });
        return new AquesTalk(dllfile, emu, {
            heapSize,
            mode: options.mode ?? "aq1",
            phont,
        });
    }
    catch (error) {
        await emu.destroy();
        throw error;
    }
}
