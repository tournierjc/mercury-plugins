// @ts-check
/**
 * openui-contract: the OpenUI Lang contract for Mercury, and the renderer that draws it.
 *
 * Two halves, one source:
 *   - the `render_ui` tool validates a spec before a client is handed it, and
 *   - `renderer/openui.html` (built from src/renderer.js) draws a fenced block in the
 *     dashboard, sandboxed by Mercury (Plugin API 1.3).
 *
 * Both import src/parse.js. There is no second parser to drift.
 *
 * @param {import('./mercury-plugin').PluginContext} ctx
 */
import { COMPONENTS, EXAMPLE, validateSpec } from './parse.js';

export { validateSpec } from './parse.js';

/**
 * @param {import('./mercury-plugin').PluginContext} ctx
 */
export async function activate(ctx) {
  const maxNodes = () => {
    const value = Number(ctx.settings.get('max_nodes') ?? 60);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 200) : 60;
  };

  ctx.tools.register({
    name: 'render_ui',
    description:
      'Validate an OpenUI Lang spec before showing it to the user. Returns the canonical spec on success, ' +
      'or the exact errors to fix. Then emit the validated spec inside a ```openui fenced block: clients ' +
      'that can render it will, the others show the code.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: { type: 'string', description: 'OpenUI Lang, one statement per line, e.g. root = Stack([a, b])' },
      },
      required: ['spec'],
    },
    execute: async (args) => {
      const result = validateSpec(String(args?.spec ?? ''), { maxNodes: maxNodes() });
      if (!result.ok) {
        ctx.log.debug('rejected a spec', { errors: result.errors.length });
        return JSON.stringify({ ok: false, errors: result.errors.slice(0, 20), nodes: result.nodes }, null, 2);
      }
      return JSON.stringify({ ok: true, nodes: result.nodes, spec: result.canonical }, null, 2);
    },
  });

  ctx.commands.register({
    name: 'openui_contract',
    run: async (args, io) => {
      if (String(args || '').trim() === 'example') {
        await io.reply('```openui\n' + EXAMPLE + '\n```');
        return;
      }
      const lines = Object.entries(COMPONENTS).map(([name, definition]) => {
        const props = Object.keys(definition.props);
        return `- ${name}: ${definition.children ? 'children only' : props.length ? props.join(', ') : '(no props)'}`;
      });
      await io.reply(['OpenUI Lang v1 — components a client must render:', ...lines, '', 'Example: /openui_contract example'].join('\n'));
    },
  });

  ctx.log.info('activated', { components: Object.keys(COMPONENTS).length });
}

export const contract = { COMPONENTS, validateSpec, EXAMPLE };
export async function deactivate() {}
