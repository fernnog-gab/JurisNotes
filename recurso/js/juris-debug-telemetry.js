/* ================================================
juris-debug-telemetry.js — v1.0
Marcadores estratégicos para caça à raiz do flicker.
Ativação: Ctrl+Shift+D  |  URL ?dbg=1  |  Snapshot: F9
================================================ */
window.DebugTelemetry = (function () {
    'use strict';
    
    // Verifica flag na URL ou no LocalStorage
    let enabled = new URLSearchParams(location.search).has('dbg') ||
                  localStorage.getItem('juris-dbg') === '1';

    const perSec = {};   // contagens da janela de 1s (taxa de disparo)
    const ring   = [];   // gravador de voo: últimos 150 eventos
    let hud = null, mmCount = 0, shiftScore = 0;

    /* ---------- Núcleo do marcador ---------- */
    function mark(tag, dados) {
        if (!enabled) return;
        perSec[tag] = (perSec[tag] || 0) + 1;
        ring.push({ t: Math.round(performance.now()), tag, ...(dados || {}) });
        if (ring.length > 150) ring.shift();
        
        // Ative o console.debug abaixo caso queira logs verbosos no console do navegador
        // console.debug('[DBG:' + tag + ']', dados || '');
    }

    /* ---------- M0: correlação com o mouse ---------- */
    document.addEventListener('mousemove', () => { mmCount++; }, { passive: true });

    /* ---------- M9: Layout Shift (o "fundo quebrando") ---------- */
    try {
        new PerformanceObserver((list) => {
            list.getEntries().forEach(e => {
                shiftScore += Number(e.value) || 0;
                mark('M9-SHIFT', {
                    score: (Number(e.value) || 0).toFixed(3),
                    alvos: (e.sources || []).slice(0, 3).map(s =>
                        (s.node && (s.node.id || s.node.className)) ||
                        (s.node && s.node.tagName) || '?')
                });
            });
        }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { /* navegador sem suporte */ }

    /* ---------- M10: Long Tasks (travamentos de frame) ---------- */
    try {
        new PerformanceObserver((list) => {
            list.getEntries().forEach(en => mark('M10-LONGTASK', { ms: Math.round(en.duration) }));
        }).observe({ type: 'longtask', buffered: true });
    } catch (e) { /* navegador sem suporte */ }

    /* ---------- HUD ---------- */
    const KEYS = ['M1-RO', 'M2-RENDER', 'M3-POS', 'M4-SVG', 'M6-MORPH',
                  'M7-WHEEL', 'M8-IMG', 'M9-SHIFT', 'M10-LONGTASK'];
    
    function buildHud() {
        if (hud || !enabled) return;
        hud = document.createElement('div');
        hud.id = 'dbg-telemetry-hud';
        hud.innerHTML = '<h4>🩺 TELEMETRIA (F9 = snap)</h4>' +
            KEYS.map(k => `<div class="dbg-row"><span>${k}</span><b id="dbg-${k}">0/s</b></div>`).join('') +
            '<div class="dbg-row"><span>MOUSE</span><b id="dbg-MM">0/s</b></div>' +
            '<div class="dbg-row"><span>SHIFT ACUM.</span><b id="dbg-LS">0</b></div>' +
            '<div class="dbg-actions"><button id="dbg-snap">Snapshot</button>' +
            '<button id="dbg-off">Fechar</button></div>';
        
        document.body.appendChild(hud);
        hud.querySelector('#dbg-snap').onclick = snapshot;
        hud.querySelector('#dbg-off').onclick = () => toggle(false);
    }

    setInterval(() => {
        if (!enabled || !hud) { 
            Object.keys(perSec).forEach(k => delete perSec[k]); 
            mmCount = 0; 
            return; 
        }
        KEYS.forEach(k => {
            const el = document.getElementById('dbg-' + k);
            if (el) el.textContent = (perSec[k] || 0) + '/s';
            delete perSec[k];
        });
        document.getElementById('dbg-MM').textContent = mmCount + '/s'; 
        mmCount = 0;
        document.getElementById('dbg-LS').textContent = shiftScore.toFixed(2);
    }, 1000);

    /* ---------- Snapshot (raio-X do momento do flicker) ---------- */
    function snapshot() {
        console.info('================================================');
        console.info('[DBG:SNAPSHOT] Últimos 150 eventos antes do clique:');
        console.table(ring);
        console.info('[DBG:SNAPSHOT] Score acumulado de Layout Shift:', shiftScore.toFixed(3));
        console.info('================================================');
        
        if (window.exibirToast) {
            window.exibirToast('Snapshot de Telemetria impresso no Console (F12).', 'info');
        }
    }

    /* ---------- Toggle ---------- */
    function toggle(force) {
        enabled = (typeof force === 'boolean') ? force : !enabled;
        localStorage.setItem('juris-dbg', enabled ? '1' : '0');
        
        if (enabled) {
            buildHud();
            if (window.exibirToast) window.exibirToast('Telemetria Ativada. HUD injetado.', 'sucesso');
        } else {
            if (hud) { hud.remove(); hud = null; }
            if (window.exibirToast) window.exibirToast('Telemetria Desativada.', 'info');
        }
    }

    // Atalhos globais
    document.addEventListener('keydown', (e) => {
        // Ctrl + Shift + D para ligar/desligar
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { 
            e.preventDefault(); 
            toggle(); 
        }
        // F9 para printar Snapshot
        if (enabled && e.key === 'F9') { 
            e.preventDefault(); 
            snapshot(); 
        }
    });

    // Injeção automática se flag estiver salva
    if (enabled && document.readyState !== 'loading') buildHud();
    if (enabled) document.addEventListener('DOMContentLoaded', buildHud);

    return { mark, snapshot, toggle, isEnabled: () => enabled };
})();