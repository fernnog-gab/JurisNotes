/* ================================================
   contrato-manager.js
   Gerenciador de Parâmetros Contratuais Globais
   (Vínculo Empregatício / Marco Prescricional)

   V1: suporta apenas 1 período de vínculo na UI/prompt.
   Estrutura interna já é um array (_dados.periodos) para
   permitir evolução futura a 1:N (múltiplos contratos/
   reclamadas) sem exigir migração de schema no backup —
   apenas ajuste de UI/prompt quando essa necessidade surgir.
   A API pública (getDados/setDados) permanece "achatada"
   (flat) propositalmente, para não propagar complexidade a
   app-core.js, backup-manager.js e export-manager.js nesta
   versão.

   Padrão de módulo IIFE, análogo a BackupManager.
   DEVE ser carregado ANTES de app-core.js.
   ================================================ */
window.ContratoManager = (function () {
    'use strict';

    // Estrutura interna expansível: array de períodos.
    // V1 usa somente _dados.periodos[0].
    let _dados = {
        periodos: [
            { inicio: '', fim: '', ajuizamento: '', funcao: '' }
        ]
    };

    /* ── Utilitários Privados ────────────────────────── */

    function _periodoAtivo() {
        if (!_dados.periodos || _dados.periodos.length === 0) {
            _dados.periodos = [{ inicio: '', fim: '', ajuizamento: '', funcao: '' }];
        }
        return _dados.periodos[0];
    }

    function _formatarDataBR(dataISO) {
        if (!dataISO) return null;
        const partes = dataISO.split('-');
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    /**
     * Calcula se o prazo bienal (2 anos do término do contrato) já se
     * esgotou em relação à data de ajuizamento. Retorna null se faltar
     * algum dado necessário — não arrisca falso positivo/negativo.
     */
    function _avaliarRiscoBienal() {
        const p = _periodoAtivo();
        if (!p.fim || !p.ajuizamento) return null;
        const dataFim = new Date(p.fim + 'T00:00:00');
        const dataAjuizamento = new Date(p.ajuizamento + 'T00:00:00');
        const doisAnosDepois = new Date(dataFim);
        doisAnosDepois.setFullYear(doisAnosDepois.getFullYear() + 2);
        return dataAjuizamento > doisAnosDepois;
    }

    /* ── UI ───────────────────────────────────────────── */

    function abrirModal() {
        const p = _periodoAtivo();
        document.getElementById('input-contrato-inicio').value = p.inicio || '';
        document.getElementById('input-contrato-fim').value = p.fim || '';
        document.getElementById('input-contrato-ajuizamento').value = p.ajuizamento || '';
        document.getElementById('input-contrato-funcao').value = p.funcao || '';
        document.getElementById('modal-contrato-backdrop').style.display = 'block';
        document.getElementById('modal-contrato-config').style.display = 'block';
    }

    function fecharModal() {
        document.getElementById('modal-contrato-backdrop').style.display = 'none';
        document.getElementById('modal-contrato-config').style.display = 'none';
    }

    function salvar() {
        const p = _periodoAtivo();
        p.inicio = document.getElementById('input-contrato-inicio').value;
        p.fim = document.getElementById('input-contrato-fim').value;
        p.ajuizamento = document.getElementById('input-contrato-ajuizamento').value;
        p.funcao = document.getElementById('input-contrato-funcao').value.trim();

        _atualizarUI();
        fecharModal();

        if (typeof salvarBackupAutomatico === 'function') salvarBackupAutomatico();
        exibirToast('Parâmetros contratuais salvos com sucesso.', 'sucesso');
    }

    function _atualizarUI() {
        const btn = document.getElementById('btn-contrato-trabalho');
        const txt = document.getElementById('contrato-status-text');
        if (!btn || !txt) return;

        const p = _periodoAtivo();
        const possuiDados = p.inicio || p.fim || p.ajuizamento || p.funcao;

        btn.classList.toggle('has-data', !!possuiDados);
        txt.textContent = possuiDados ? 'Dados Salvos' : 'Contrato';

        const riscoBienal = _avaliarRiscoBienal();
        btn.classList.toggle('alerta-prescricao', riscoBienal === true);

        if (possuiDados) {
            let tooltip = 'Parâmetros Atuais:\n';
            tooltip += `Admissão: ${_formatarDataBR(p.inicio) || 'Não inf.'}\n`;
            tooltip += `Demissão: ${_formatarDataBR(p.fim) || 'Não inf.'}\n`;
            tooltip += `Ajuizamento: ${_formatarDataBR(p.ajuizamento) || 'Não inf.'}\n`;
            tooltip += `Função: ${p.funcao || 'Não inf.'}`;
            if (riscoBienal === true) tooltip += '\n\n⚠ Possível prescrição bienal — verificar.';
            btn.title = tooltip;
        } else {
            btn.title = 'Adicionar Parâmetros do Contrato';
        }
    }

    /* ── API Pública ──────────────────────────────────────
       Formato ACHATADO (flat) por design — app-core.js,
       backup-manager.js e export-manager.js consomem apenas
       este formato em V1, sem nenhum conhecimento de que a
       estrutura interna já é um array.
       ─────────────────────────────────────────────────── */
    return {
        abrirModal,
        fecharModal,
        salvar,

        getDados: () => {
            const p = _periodoAtivo();
            return { inicio: p.inicio, fim: p.fim, ajuizamento: p.ajuizamento, funcao: p.funcao };
        },

        setDados: (novosDadosFlat) => {
            _dados = {
                periodos: [
                    novosDadosFlat
                        ? { inicio: '', fim: '', ajuizamento: '', funcao: '', ...novosDadosFlat }
                        : { inicio: '', fim: '', ajuizamento: '', funcao: '' }
                ]
            };
            _atualizarUI();
        }
    };
})();