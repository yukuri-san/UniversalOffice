var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _Heap_instances, _Heap_reset_position, _Heap_high_water_mark, _Heap_allocations, _Heap_free_blocks, _Heap_coalesce_free_blocks, _Heap_release_free_tail;
const HEAP_ALIGNMENT = 4;
export class HeapOutOfMemoryError extends Error {
    constructor() {
        super("heap over");
        this.name = "HeapOutOfMemoryError";
    }
}
export class Heap {
    constructor(_emu, heap_addr, heap_len = 0) {
        _Heap_instances.add(this);
        this.heap_used = 0;
        _Heap_reset_position.set(this, 0);
        _Heap_high_water_mark.set(this, 0);
        _Heap_allocations.set(this, new Map());
        _Heap_free_blocks.set(this, []);
        this.heap_addr = heap_addr;
        this.heap_len = heap_len;
    }
    allocate(size) {
        if (!Number.isSafeInteger(size) || size < 0) {
            throw new RangeError(`invalid allocation size: ${size}`);
        }
        // MSVCRT malloc(0) may return a unique, freeable pointer. Reserving one
        // aligned unit preserves that behaviour and avoids duplicate addresses.
        const allocation_size = align_up(Math.max(size, 1), HEAP_ALIGNMENT);
        let best_index = -1;
        for (let index = 0; index < __classPrivateFieldGet(this, _Heap_free_blocks, "f").length; index += 1) {
            const block = __classPrivateFieldGet(this, _Heap_free_blocks, "f")[index];
            if (block.size >= allocation_size &&
                (best_index === -1 || block.size < __classPrivateFieldGet(this, _Heap_free_blocks, "f")[best_index].size)) {
                best_index = index;
            }
        }
        if (best_index !== -1) {
            const block = __classPrivateFieldGet(this, _Heap_free_blocks, "f")[best_index];
            // Carve reused space from the high end. AquesTalk grows its WAV buffer
            // in 32 KiB steps (malloc new -> copy -> free old); preserving the low
            // edge lets adjacent old buffers coalesce instead of leaving a ladder
            // of unusable fragments.
            const address = block.address + block.size - allocation_size;
            if (block.size === allocation_size) {
                __classPrivateFieldGet(this, _Heap_free_blocks, "f").splice(best_index, 1);
            }
            else {
                block.size -= allocation_size;
            }
            __classPrivateFieldGet(this, _Heap_allocations, "f").set(address, allocation_size);
            return address;
        }
        const aligned_used = align_up(this.heap_used, HEAP_ALIGNMENT);
        if (aligned_used + allocation_size > this.heap_len) {
            throw new HeapOutOfMemoryError();
        }
        const address = this.heap_addr + aligned_used;
        this.heap_used = aligned_used + allocation_size;
        __classPrivateFieldSet(this, _Heap_high_water_mark, Math.max(__classPrivateFieldGet(this, _Heap_high_water_mark, "f"), this.heap_used), "f");
        __classPrivateFieldGet(this, _Heap_allocations, "f").set(address, allocation_size);
        return address;
    }
    allocate_zeroed(emu, size) {
        const address = this.allocate(size);
        emu.mem_clear(address, size);
        return address;
    }
    try_allocate_zeroed(emu, size) {
        try {
            return this.allocate_zeroed(emu, size);
        }
        catch (error) {
            if (error instanceof HeapOutOfMemoryError)
                return 0;
            throw error;
        }
    }
    free(address) {
        if (address === 0)
            return;
        const size = __classPrivateFieldGet(this, _Heap_allocations, "f").get(address);
        if (size === undefined || address < this.heap_addr + __classPrivateFieldGet(this, _Heap_reset_position, "f")) {
            throw new RangeError(`invalid free address: 0x${address.toString(16)}`);
        }
        __classPrivateFieldGet(this, _Heap_allocations, "f").delete(address);
        const block = { address, size };
        let insert_at = 0;
        while (insert_at < __classPrivateFieldGet(this, _Heap_free_blocks, "f").length &&
            __classPrivateFieldGet(this, _Heap_free_blocks, "f")[insert_at].address < address) {
            insert_at += 1;
        }
        __classPrivateFieldGet(this, _Heap_free_blocks, "f").splice(insert_at, 0, block);
        __classPrivateFieldGet(this, _Heap_instances, "m", _Heap_coalesce_free_blocks).call(this);
        __classPrivateFieldGet(this, _Heap_instances, "m", _Heap_release_free_tail).call(this);
    }
    set_mem_value(emu, value) {
        const write_address = this.allocate(value.length);
        emu.mem_write(write_address, value);
        return write_address;
    }
    preserve_allocations() {
        __classPrivateFieldSet(this, _Heap_reset_position, this.heap_used, "f");
        __classPrivateFieldSet(this, _Heap_high_water_mark, this.heap_used, "f");
        __classPrivateFieldGet(this, _Heap_allocations, "f").clear();
        __classPrivateFieldGet(this, _Heap_free_blocks, "f").length = 0;
    }
    reset_allocations() {
        this.heap_used = __classPrivateFieldGet(this, _Heap_reset_position, "f");
        __classPrivateFieldSet(this, _Heap_high_water_mark, __classPrivateFieldGet(this, _Heap_reset_position, "f"), "f");
        __classPrivateFieldGet(this, _Heap_allocations, "f").clear();
        __classPrivateFieldGet(this, _Heap_free_blocks, "f").length = 0;
    }
    clear_heap(emu) {
        const clear_length = __classPrivateFieldGet(this, _Heap_high_water_mark, "f") - __classPrivateFieldGet(this, _Heap_reset_position, "f");
        if (clear_length > 0) {
            emu.mem_clear(this.heap_addr + __classPrivateFieldGet(this, _Heap_reset_position, "f"), clear_length);
        }
        this.reset_allocations();
    }
}
_Heap_reset_position = new WeakMap(), _Heap_high_water_mark = new WeakMap(), _Heap_allocations = new WeakMap(), _Heap_free_blocks = new WeakMap(), _Heap_instances = new WeakSet(), _Heap_coalesce_free_blocks = function _Heap_coalesce_free_blocks() {
    for (let index = 1; index < __classPrivateFieldGet(this, _Heap_free_blocks, "f").length;) {
        const previous = __classPrivateFieldGet(this, _Heap_free_blocks, "f")[index - 1];
        const current = __classPrivateFieldGet(this, _Heap_free_blocks, "f")[index];
        if (previous.address + previous.size === current.address) {
            previous.size += current.size;
            __classPrivateFieldGet(this, _Heap_free_blocks, "f").splice(index, 1);
        }
        else {
            index += 1;
        }
    }
}, _Heap_release_free_tail = function _Heap_release_free_tail() {
    while (__classPrivateFieldGet(this, _Heap_free_blocks, "f").length > 0) {
        const block = __classPrivateFieldGet(this, _Heap_free_blocks, "f")[__classPrivateFieldGet(this, _Heap_free_blocks, "f").length - 1];
        if (block.address + block.size !== this.heap_addr + this.heap_used)
            return;
        this.heap_used = block.address - this.heap_addr;
        __classPrivateFieldGet(this, _Heap_free_blocks, "f").pop();
    }
};
function align_up(value, alignment) {
    return Math.ceil(value / alignment) * alignment;
}
export const NOP = 0x90;
export function hook_lib_call(emu, address, callback, arg = null) {
    emu.set_hook(address, (hookEmu, userData) => {
        callback(hookEmu, userData);
    }, arg);
}
export function reg_read_uint32(emu, reg) {
    return emu.reg_read(reg);
}
export function reg_write_uint32(emu, reg, value) {
    emu.reg_write(reg, value);
}
export function align_to_0x1000(number) {
    return Math.floor((number + 0xfff) / 0x1000) * 0x1000;
}
