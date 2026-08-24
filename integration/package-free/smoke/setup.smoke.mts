import { expect, smoke } from 'smoque';

smoke.suite('setup-zcheck package-free consumer', async (t) => {
    await t.step('uses the exact installed zcheck release', async () => {
        const version = await t.cmd('zcheck', ['--version']);

        expect.value(version.stdout.trim()).toBe('zcheck 0.0.2');
    });

    await t.step('runs the consumer-selected validation operation', async () => {
        await t.cmd('zcheck', ['validate']);
    });
});
