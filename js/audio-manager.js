/* ================================================
   audio-manager.js
   Módulo de gravação de marcadores de Oitiva.
   ================================================ */
window.AudioManager = (function() {
    'use strict';

    let _deps = {}; // Recebe dependências externas via init()
    let _audioUrl = null;
    let _timeStart = null;
    let _timeEnd = null;

    // --- Injeção de Dependências ---
    function init(dependencies) {
        _deps = dependencies;
    }

    function formatTime(seconds) {
        if (seconds === null || isNaN(seconds)) return "--' --''";
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}' ${s}''`;
    }

    async function iniciarSessao() {
        const topicosAtuais = _deps.getTopicos(); // Correção: uso do getter
        if (!topicosAtuais || topicosAtuais.length === 0) {
            _deps.exibirToast('Crie pelo menos um Tópico Recursal antes de analisar a audiência.', 'aviso');
            return;
        }

        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Áudio da Audiência (MP3/WAV)',
                    accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'] }
                }]
            });
            const file = await fileHandle.getFile();
            
            if (_audioUrl) URL.revokeObjectURL(_audioUrl);
            _audioUrl = URL.createObjectURL(file);
            
            document.getElementById('main-audio-player').src = _audioUrl;
            document.getElementById('active-audio-indicator').style.display = 'flex';
            
            abrirPlayer();
            _deps.exibirToast('Audiência carregada com sucesso!', 'sucesso');
        } catch (err) {
            if (err.name !== 'AbortError') _deps.exibirToast('Erro ao carregar o arquivo.', 'erro');
        }
    }

    function abrirPlayer() { document.getElementById('audio-player-panel').style.display = 'flex'; }
    function fecharPlayer() { document.getElementById('audio-player-panel').style.display = 'none'; }
    function alternarPlayer() {
        const p = document.getElementById('audio-player-panel');
        p.style.display = (p.style.display === 'none') ? 'flex' : 'none';
    }

    function marcarInicio() {
        const audio = document.getElementById('main-audio-player');
        _timeStart = audio.currentTime;
        document.getElementById('audio-marker-start').innerText = `Início: ${formatTime(_timeStart)}`;
        _deps.exibirToast('Início marcado. Avance o áudio e marque o fim.', 'sucesso');
    }

    function marcarFim() {
        const audio = document.getElementById('main-audio-player');
        if (_timeStart === null) {
            _deps.exibirToast('Marque o início do trecho primeiro!', 'aviso');
            return;
        }
        _timeEnd = audio.currentTime;
        if (_timeEnd <= _timeStart) {
            _deps.exibirToast('O fim deve ser maior que o início.', 'erro');
            return;
        }
        document.getElementById('audio-marker-end').innerText = `Fim: ${formatTime(_timeEnd)}`;
        
        audio.pause();
        abrirModalClassificacao();
    }

    function abrirModalClassificacao() {
        const selectTopico = document.getElementById('audio-topic-select');
        selectTopico.innerHTML = '<option value="">Selecione o Tópico...</option>';
        
        const topicosAtuais = _deps.getTopicos(); // Correção: uso do getter
        topicosAtuais.forEach(t => selectTopico.appendChild(new Option(t.nome, t.id)));
        
        document.getElementById('audio-speaker-role').value = '';
        document.getElementById('audio-speaker-side-box').style.display = 'none';
        document.getElementById('audio-comment').value = '';
        
        const backdrop = document.getElementById('wizard-backdrop');
        if(backdrop) backdrop.style.display = 'block';
        document.getElementById('audio-classification-popup').style.display = 'flex';
    }

    function onRoleChange() {
        const role = document.getElementById('audio-speaker-role').value;
        const sideBox = document.getElementById('audio-speaker-side-box');
        if (role === 'Testemunha' || role === 'Advogado') {
            sideBox.style.display = 'block';
        } else {
            sideBox.style.display = 'none';
        }
    }

    function toggleAgrupar() {
        const agrupar = document.querySelector('input[name="modo_agrupar_audio"]:checked').value === 'agrupar';
        document.getElementById('audio-input-ideia').style.display = agrupar ? 'block' : 'none';
    }

    function salvarRecorte() {
        const topicoId = document.getElementById('audio-topic-select').value;
        const role = document.getElementById('audio-speaker-role').value;
        const comment = document.getElementById('audio-comment').value.trim();
        
        if (!topicoId || !role) {
            _deps.exibirToast('Tópico e Orador são obrigatórios.', 'aviso'); return;
        }

        let polo = '';
        let oradorFinal = '';

        if (role === 'Testemunha' || role === 'Advogado') {
            polo = document.getElementById('audio-speaker-side').value;
            oradorFinal = `${role} da ${polo}`;
        } else if (role === 'Preposto') {
            polo = 'Parte Ré';
            oradorFinal = 'Preposto (Parte Ré)';
        } else if (role === 'Juízo') {
            polo = 'Juízo';
            oradorFinal = 'Magistrado / Juízo';
        } else if (role === 'Parte Autora') {
            polo = 'Parte Autora';
            oradorFinal = 'Depoimento Pessoal (Autora)';
        } else if (role === 'Parte Ré') {
            polo = 'Parte Ré';
            oradorFinal = 'Depoimento Pessoal (Ré)';
        }
        
        let targetIndex = null;
        if (document.querySelector('input[name="modo_agrupar_audio"]:checked').value === 'agrupar') {
            const numero = parseInt(document.getElementById('audio-input-ideia').value, 10);
            const topicosAtuais = _deps.getTopicos(); // Correção: uso do getter
            const topico = topicosAtuais.find(t => t.id === topicoId);
            
            if (isNaN(numero) || numero < 1 || numero > topico.anotacoes.length) {
                _deps.exibirToast('Número de agrupamento inválido.', 'erro'); return;
            }
            targetIndex = numero - 1;
        }

        const conteudoFormatado = JSON.stringify({
            inicio: _timeStart, fim: _timeEnd,
            oradorStr: oradorFinal,
            labelInicio: formatTime(_timeStart), labelFim: formatTime(_timeEnd)
        });

        _deps.salvarAnotacao('audio', conteudoFormatado, 'Ata de Audiência / MP3', polo, topicoId, comment, targetIndex);
        
        cancelarAnotacao(); // Fecha o modal
        fecharPlayer();     // Força o player a minimizar e deixar apenas o ícone pulsando
        _deps.exibirToast('Trecho da oitiva salvo!', 'sucesso');
    }

    function cancelarAnotacao() {
        document.getElementById('audio-classification-popup').style.display = 'none';
        const backdrop = document.getElementById('wizard-backdrop');
        if(backdrop) backdrop.style.display = 'none';
        
        _timeStart = null; _timeEnd = null;
        document.getElementById('audio-marker-start').innerText = "Início: --' --''";
        document.getElementById('audio-marker-end').innerText = "Fim: --' --''";
    }

    return {
        init, iniciarSessao, abrirPlayer, fecharPlayer, alternarPlayer,
        marcarInicio, marcarFim, onRoleChange, toggleAgrupar,
        salvarRecorte, cancelarAnotacao
    };
})();
