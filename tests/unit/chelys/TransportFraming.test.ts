import {
    FrameReassembler,
    MAX_FRAME_BODY,
    encodeFrames,
} from '@chelys/peer/TransportFraming';

const HEADER_BYTES = 26;
const OFFSET_MAGIC = 0;
const OFFSET_MESSAGE_ID = 2;
const OFFSET_SEQUENCE = 6;
const OFFSET_TOTAL = 10;
const OFFSET_KIND = 14;
const OFFSET_LENGTH = 15;

const bytes = (length: number, seed = 0): Uint8Array =>
    Uint8Array.from({ length }, (_, index) => (index * 31 + seed) % 256);

const messageIdOf = (frame: ArrayBuffer): number =>
    new DataView(frame).getUint32(OFFSET_MESSAGE_ID);

const rewrite = (
    frame: ArrayBuffer,
    mutate: (view: DataView) => void,
): ArrayBuffer => {
    const copy = frame.slice(0);
    mutate(new DataView(copy));
    return copy;
};

describe('Transport Framing', () => {
    describe('encodeFrames', () => {
        it('should emit a single header-only frame for an empty payload', () => {
            const frames = encodeFrames('');

            expect(frames).toHaveLength(1);
            expect(frames[0].byteLength).toBe(HEADER_BYTES);
        });

        it('should keep a payload of exactly MAX_FRAME_BODY in one frame', () => {
            const frames = encodeFrames(bytes(MAX_FRAME_BODY));

            expect(frames).toHaveLength(1);
            expect(frames[0].byteLength).toBe(HEADER_BYTES + MAX_FRAME_BODY);
        });

        it('should split one byte past MAX_FRAME_BODY into two frames', () => {
            const frames = encodeFrames(bytes(MAX_FRAME_BODY + 1));

            expect(frames).toHaveLength(2);
            expect(frames[1].byteLength).toBe(HEADER_BYTES + 1);
        });

        it('should allocate a distinct message id per call', () => {
            const first = encodeFrames('a');
            const second = encodeFrames('a');

            expect(messageIdOf(first[0])).not.toBe(messageIdOf(second[0]));
        });

        it('should share one message id across every frame of a message', () => {
            const frames = encodeFrames(bytes(MAX_FRAME_BODY * 2 + 5));
            const ids = frames.map(messageIdOf);

            expect(frames).toHaveLength(3);
            expect(new Set(ids).size).toBe(1);
        });
    });

    describe('FrameReassembler round trip', () => {
        it('should recover a short string as a string', () => {
            const reassembler = new FrameReassembler();
            const frames = encodeFrames('hello transport');

            expect(reassembler.push(frames[0])).toBe('hello transport');
        });

        it('should recover binary payloads as bytes, not text', () => {
            const reassembler = new FrameReassembler();
            const payload = Uint8Array.from([0, 1, 254, 255]);
            const result = reassembler.push(encodeFrames(payload)[0]);

            expect(result).toBeInstanceOf(Uint8Array);
            expect(Array.from(result as Uint8Array)).toEqual([0, 1, 254, 255]);
        });

        it('should preserve multi-byte characters across a chunk boundary', () => {
            const reassembler = new FrameReassembler();
            const payload = 'é'.repeat(MAX_FRAME_BODY);
            const frames = encodeFrames(payload);

            expect(frames.length).toBeGreaterThan(1);
            let result: unknown = null;
            for (const frame of frames) result = reassembler.push(frame);
            expect(result).toBe(payload);
        });

        it('should reassemble a large binary payload', () => {
            const reassembler = new FrameReassembler();
            const payload = bytes(MAX_FRAME_BODY * 2 + 17, 7);
            const frames = encodeFrames(payload);

            expect(frames).toHaveLength(3);
            expect(reassembler.push(frames[0])).toBeNull();
            expect(reassembler.push(frames[1])).toBeNull();
            expect(reassembler.push(frames[2])).toEqual(payload);
        });

        it('should reassemble frames that arrive out of order', () => {
            const reassembler = new FrameReassembler();
            const payload = bytes(MAX_FRAME_BODY + 40, 3);
            const frames = encodeFrames(payload);

            expect(reassembler.push(frames[1])).toBeNull();
            expect(reassembler.push(frames[0])).toEqual(payload);
        });

        it('should ignore a duplicated frame instead of double counting it', () => {
            const reassembler = new FrameReassembler();
            const payload = bytes(MAX_FRAME_BODY + 40, 9);
            const frames = encodeFrames(payload);

            expect(reassembler.push(frames[0])).toBeNull();
            expect(reassembler.push(frames[0])).toBeNull();
            expect(reassembler.push(frames[1])).toEqual(payload);
        });

        it('should keep interleaved messages separate', () => {
            const reassembler = new FrameReassembler();
            const first = bytes(MAX_FRAME_BODY + 10, 1);
            const second = bytes(MAX_FRAME_BODY + 20, 2);
            const framesA = encodeFrames(first);
            const framesB = encodeFrames(second);

            expect(reassembler.push(framesA[0])).toBeNull();
            expect(reassembler.push(framesB[0])).toBeNull();
            expect(reassembler.push(framesB[1])).toEqual(second);
            expect(reassembler.push(framesA[1])).toEqual(first);
        });
    });

    describe('FrameReassembler rejection', () => {
        it('should reject a buffer shorter than the header', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({ onError });

            expect(reassembler.push(new ArrayBuffer(10))).toBeNull();
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Invalid transport frame header',
                }),
            );
        });

        it('should reject a frame with the wrong magic number', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({ onError });
            const frame = rewrite(encodeFrames('x')[0], (view) =>
                view.setUint16(OFFSET_MAGIC, 0x0000),
            );

            expect(reassembler.push(frame)).toBeNull();
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Invalid transport frame header',
                }),
            );
        });

        it('should reject an unknown payload kind', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({ onError });
            const frame = rewrite(encodeFrames('x')[0], (view) =>
                view.setUint8(OFFSET_KIND, 2),
            );

            expect(reassembler.push(frame)).toBeNull();
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Invalid transport frame header',
                }),
            );
        });

        it('should reject a sequence outside the declared total', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({ onError });
            const frame = rewrite(encodeFrames('x')[0], (view) =>
                view.setUint32(OFFSET_SEQUENCE, 1),
            );

            expect(reassembler.push(frame)).toBeNull();
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Invalid transport frame'),
                }),
            );
        });

        it('should reject a total of zero', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({ onError });
            const frame = rewrite(encodeFrames('x')[0], (view) =>
                view.setUint32(OFFSET_TOTAL, 0),
            );

            expect(reassembler.push(frame)).toBeNull();
            expect(onError).toHaveBeenCalled();
        });

        it('should reject a single frame whose body contradicts its length', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({ onError });
            const frame = rewrite(encodeFrames('x')[0], (view) =>
                view.setUint32(OFFSET_LENGTH, 99),
            );

            expect(reassembler.push(frame)).toBeNull();
            expect(onError).toHaveBeenCalled();
        });

        it('should drop a message when a later frame contradicts the first', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({ onError });
            const twoFrames = encodeFrames(bytes(MAX_FRAME_BODY + 10, 4));
            const threeFrames = encodeFrames(bytes(MAX_FRAME_BODY * 2 + 10, 5));
            const conflicting = rewrite(threeFrames[0], (view) =>
                view.setUint32(OFFSET_MESSAGE_ID, messageIdOf(twoFrames[0])),
            );

            expect(reassembler.push(twoFrames[0])).toBeNull();
            expect(reassembler.push(conflicting)).toBeNull();
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Conflicting transport frames'),
                }),
            );
            expect(reassembler.push(twoFrames[1])).toBeNull();
        });
    });

    describe('FrameReassembler lifetime', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should report a timeout for a message that never completes', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({
                idleTimeoutMs: 1000,
                onError,
            });
            const frames = encodeFrames(bytes(MAX_FRAME_BODY + 10, 6));

            reassembler.push(frames[0]);
            jest.advanceTimersByTime(1000);

            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Timed out reassembling transport message',
                    ),
                }),
            );
        });

        it('should extend the timeout while frames keep arriving', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({
                idleTimeoutMs: 1000,
                onError,
            });
            const payload = bytes(MAX_FRAME_BODY * 2 + 10, 8);
            const frames = encodeFrames(payload);

            reassembler.push(frames[0]);
            jest.advanceTimersByTime(800);
            reassembler.push(frames[1]);
            jest.advanceTimersByTime(800);

            expect(onError).not.toHaveBeenCalled();
            expect(reassembler.push(frames[2])).toEqual(payload);
        });

        it('should not emit a timeout after reset clears pending messages', () => {
            const onError = jest.fn();
            const reassembler = new FrameReassembler({
                idleTimeoutMs: 1000,
                onError,
            });

            reassembler.push(encodeFrames(bytes(MAX_FRAME_BODY + 10, 2))[0]);
            reassembler.reset();
            jest.advanceTimersByTime(5000);

            expect(onError).not.toHaveBeenCalled();
        });
    });
});
