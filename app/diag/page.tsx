import { headers } from 'next/headers';
import { isHandheldUserAgent } from '@/lib/device';

/**
 * Public, session-free diagnostic page.
 *
 * Exists because the tablet nav bug could not be reproduced from any desktop
 * browser: the device reports a >=1024px CSS viewport AND a fine pointer, and
 * the browser-automation tooling available here cannot override the
 * User-Agent. This page lets a person on the actual device confirm, in one
 * screenshot, (a) which build they are running and (b) how the server
 * classified their device.
 *
 * It renders NO session, project, or user data — it must stay safe to expose
 * unauthenticated (it is excluded from the proxy auth matcher).
 */
export const dynamic = 'force-dynamic';

export default async function DiagPage() {
  const h = await headers();
  const ua = h.get('user-agent');
  const handheld = isHandheldUserAgent(ua);

  const rows: Array<[string, string]> = [
    // Netlify exposes the deployed commit SHA as COMMIT_REF at build time.
    ['Build (commit)', (process.env.COMMIT_REF ?? 'local-dev').slice(0, 12)],
    ['Rendered at (UTC)', new Date().toISOString()],
    ['Detected as handheld', handheld ? 'YES' : 'NO'],
    ['Navigation you get', handheld ? 'Hamburger drawer (always visible)' : 'Desktop sidebar at >=1024px'],
    ['User-Agent', ua ?? '(none sent)'],
  ];

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>TRT PM — device diagnostic</h1>
      <p style={{ marginTop: 0, color: '#555', fontSize: 14 }}>
        Screenshot this page so the exact build and device detection can be confirmed.
      </p>

      <div
        style={{
          border: '2px solid',
          borderColor: handheld ? '#0a7c2f' : '#b3261e',
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
          background: handheld ? '#e8f5ec' : '#fdecea',
        }}
      >
        <strong style={{ fontSize: 18 }}>
          {handheld ? 'Handheld detected — hamburger menu enabled' : 'Treated as DESKTOP — sidebar mode'}
        </strong>
      </div>

      <table style={{ borderCollapse: 'collapse', marginTop: 20, width: '100%', maxWidth: 900 }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td
                style={{
                  border: '1px solid #ccc',
                  padding: '8px 10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  verticalAlign: 'top',
                  background: '#fafafa',
                }}
              >
                {label}
              </td>
              <td
                style={{
                  border: '1px solid #ccc',
                  padding: '8px 10px',
                  wordBreak: 'break-all',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 13,
                }}
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 20, fontSize: 14, color: '#555' }}>
        Viewport (measured in your browser):{' '}
        <span id="vp" style={{ fontFamily: 'ui-monospace, monospace' }}>
          measuring…
        </span>
      </p>

      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){
            var el = document.getElementById('vp');
            if (!el) return;
            var fine = window.matchMedia('(pointer: fine)').matches;
            el.textContent = window.innerWidth + ' x ' + window.innerHeight +
              ' CSS px, DPR ' + (window.devicePixelRatio || 1) +
              ', pointer: ' + (fine ? 'fine' : 'coarse') +
              ', standalone: ' + (window.matchMedia('(display-mode: standalone)').matches ? 'yes (installed app)' : 'no (browser tab)');
          })();`,
        }}
      />
    </main>
  );
}
