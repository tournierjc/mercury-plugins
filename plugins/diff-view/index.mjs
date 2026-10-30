// @ts-check
/**
 * diff-view: declares a renderer and nothing else.
 *
 * A plugin whose entire contribution is a fenced-block renderer (Plugin API 1.3). It
 * registers no tool and no command: what it adds lives in the dashboard, drawn inside a
 * sandboxed iframe from renderer/diff.html. This is the proof that the renderer seam is
 * generic — the core knows nothing about "diff".
 *
 * @param {import('./mercury-plugin').PluginContext} ctx
 */
export async function activate(ctx) {
  ctx.log.info('activated', { renderer: 'diff' });
}

export async function deactivate() {}
