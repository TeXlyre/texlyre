import {
    WEBAUTHN_RP_NAME,
    deriveIdentity,
    fromHex,
    toHex,
} from '@chelys/protocol';

const { webcrypto } = require('node:crypto');

const PRF_ZERO = new Uint8Array(32);
const PRF_COUNTING = Uint8Array.from({ length: 32 }, (_, index) => index);

describe('Chelys Protocol', () => {
    let stubbedSubtle: SubtleCrypto;

    beforeAll(() => {
        stubbedSubtle = (global.crypto as { subtle: SubtleCrypto }).subtle;
        (global.crypto as { subtle: SubtleCrypto }).subtle = webcrypto.subtle;
    });

    afterAll(() => {
        (global.crypto as { subtle: SubtleCrypto }).subtle = stubbedSubtle;
    });

    describe('toHex and fromHex', () => {
        it('should round trip arbitrary bytes', () => {
            const bytes = Uint8Array.from([0, 1, 15, 16, 127, 128, 254, 255]);

            expect(fromHex(toHex(bytes))).toEqual(bytes);
        });

        it('should pad single digit bytes', () => {
            expect(toHex(Uint8Array.from([0, 5, 10]))).toBe('00050a');
        });

        it('should accept uppercase and surrounding whitespace', () => {
            expect(fromHex('  0A1B  ')).toEqual(Uint8Array.from([10, 27]));
        });

        it('should reject an odd number of hex digits', () => {
            expect(() => fromHex('abc')).toThrow('invalid hex length');
        });
    });

    describe('deriveIdentity', () => {
        it('should produce the published vector for a zero PRF output', async () => {
            const identity = await deriveIdentity({
                username: 'alice',
                password: 'correct horse battery staple',
                prfOutput: PRF_ZERO,
            });

            expect(identity).toEqual({
                roomId:
                    '8b4d1694ccc85d7029b3141fd05597660d03239f76b1df9d80e14dc92c866070',
                roomKey:
                    '4dd6bc7d92da4a4e3774e296f2ecf2138d97c706b6f5141a5eab2412d372f6f6',
            });
        });

        it('should produce the published vector for a distinct PRF output', async () => {
            const identity = await deriveIdentity({
                username: 'alice',
                password: 'correct horse battery staple',
                prfOutput: PRF_COUNTING,
            });

            expect(identity).toEqual({
                roomId:
                    '5d77b44d305044ba253a6e64f40193b7764372a1d91e147c9df66b48e6e8f700',
                roomKey:
                    '4219a0ba7cb78e9fc80031b8c1955d1c9d32e43c3e64e0840b7e06de61be861d',
            });
        });

        it('should produce the published vector for a different username', async () => {
            const identity = await deriveIdentity({
                username: 'bob',
                password: 'correct horse battery staple',
                prfOutput: PRF_ZERO,
            });

            expect(identity).toEqual({
                roomId:
                    'b542cb9446b58f21a34716825c949bfe035f4b4c370ab8734e63444d12ff8623',
                roomKey:
                    'a4541b397ab85b4270a4283fa97cee47a0b43f5c1da1c325c62a37fee9151f5b',
            });
        });

        it('should never reuse the room id as the room key', async () => {
            const identity = await deriveIdentity({
                username: 'alice',
                password: 'correct horse battery staple',
                prfOutput: PRF_ZERO,
            });

            expect(identity.roomId).not.toBe(identity.roomKey);
            expect(identity.roomId).toHaveLength(64);
            expect(identity.roomKey).toHaveLength(64);
        });
    });

    describe('WebAuthn constants', () => {
        it('should keep the relying party name stable', () => {
            expect(WEBAUTHN_RP_NAME).toBe('Chelys');
        });
    });
});
