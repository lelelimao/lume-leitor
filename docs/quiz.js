"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const topics = {
    fundamentos: {label: "Como a IA funciona", section: "#investigacao"},
    impactos: {label: "Impactos na vida real", section: "#impactos"},
    etica: {label: "Ética e decisões", section: "#responsabilidade"},
    sociedade: {label: "Informação e sociedade", section: "#humano"},
  };
  const levels = {basico: "Básica", medio: "Intermediária", avancado: "Desafio"};
  const bank = [
    ["fundamentos", "basico", "O que a inteligência artificial faz ao reconhecer um padrão em dados?", ["Lê pensamentos humanos", "Encontra regularidades úteis para uma tarefa", "Prova que toda decisão é correta", "Substitui automaticamente todos os profissionais"], 1, "A IA identifica relações nos exemplos recebidos. O resultado ainda precisa ser interpretado e conferido."],
    ["fundamentos", "basico", "Para que servem os dados de treinamento?", ["Para ajustar o modelo a partir de exemplos", "Para guardar somente o resultado final", "Para dispensar qualquer teste", "Para impedir novos erros"], 0, "O treinamento ajusta o modelo com exemplos. Depois é preciso avaliar como ele se sai em situações novas."],
    ["fundamentos", "medio", "Por que um classificador de imagens pode errar com uma foto diferente das usadas no treinamento?", ["Porque a câmera sempre altera a verdade", "Porque imagens não contêm dados", "Porque os padrões aprendidos podem não servir à nova situação", "Porque o modelo tem intenção de enganar"], 2, "Mudanças de iluminação, contexto e tipo de imagem podem reduzir a capacidade de generalização."],
    ["fundamentos", "medio", "Qual cuidado é necessário ao usar a resposta de um modelo de linguagem como fonte?", ["Aceitar porque o texto parece seguro", "Contar o número de palavras", "Usar apenas frases longas", "Conferir fatos em fontes verificáveis"], 3, "Um texto fluente pode conter erros. Fonte e evidência precisam ser verificadas à parte."],
    ["fundamentos", "avancado", "O que é sobreajuste no treinamento de um modelo?", ["Aprender detalhes dos exemplos de treino e falhar em casos novos", "Treinar com poucos computadores", "Mostrar sempre respostas curtas", "Reduzir a precisão apenas no treino"], 0, "Um modelo sobreajustado vai bem nos exemplos conhecidos, mas generaliza mal."],
    ["fundamentos", "avancado", "Um sistema acertou 95% em um teste. O que ainda falta avaliar antes do uso real?", ["Somente a cor da interface", "Se ele pode ser chamado de inteligente", "Desempenho em novos contextos e diferentes grupos", "Se o resultado cabe em uma frase"], 2, "Uma média alta pode esconder falhas em grupos específicos ou em situações diferentes do teste."],

    ["impactos", "basico", "Na saúde, qual é um uso responsável de IA?", ["Eliminar a avaliação clínica", "Apoiar profissionais com sinais e informações a conferir", "Garantir um diagnóstico sem exame", "Prescrever a mesma solução para todos"], 1, "A IA pode apoiar a análise; a interpretação clínica e a responsabilidade continuam com profissionais."],
    ["impactos", "basico", "Como a IA pode ajudar na educação?", ["Adaptando exercícios ao ritmo do estudante, com orientação docente", "Substituindo toda interação entre professor e turma", "Dando sempre a resposta sem explicação", "Usando a mesma atividade para todos"], 0, "A personalização pode ajudar, desde que o professor acompanhe a aprendizagem."],
    ["impactos", "medio", "Uma projeção diz que a IA pode contribuir muito para a economia. Como interpretá-la?", ["Como resultado garantido para cada empresa", "Como dinheiro já disponível", "Como prova de que empregos não mudarão", "Como estimativa dependente de adoção, investimento e contexto"], 3, "Projeções mostram cenários possíveis, não resultados certos. Seus pressupostos devem ser considerados."],
    ["impactos", "medio", "No monitoramento ambiental, qual limite deve ser lembrado?", ["Satélites dispensam qualquer medição", "Todo alerta é falso", "Alertas de IA precisam ser validados com dados e contexto", "A IA impede o desmatamento sozinha"], 2, "Modelos podem apontar áreas de atenção, mas alertas precisam de verificação e ação humana."],
    ["impactos", "avancado", "Um estudo retrospectivo encontra sinais antes de alguns diagnósticos. O que ele demonstra?", ["Que todos os casos serão detectados no futuro", "Que havia sinais possíveis nos dados estudados, exigindo validação antes do uso clínico", "Que médicos não são mais necessários", "Que o sistema já substitui exames"], 1, "Resultados retrospectivos são promissores, mas não garantem o mesmo desempenho em novos pacientes."],
    ["impactos", "avancado", "Como distribuir melhor os ganhos de produtividade da automação?", ["Com formação, adaptação do trabalho e atenção a quem é afetado", "Ignorando as funções que mudam", "Reservando o benefício a uma única empresa", "Evitando qualquer avaliação do impacto"], 0, "Produtividade e justiça social dependem também de políticas, qualificação e escolhas de gestão."],

    ["etica", "basico", "Por que dados históricos podem gerar viés em um sistema de IA?", ["Porque dados antigos são sempre inúteis", "Porque máquinas preferem uma pessoa", "Porque desigualdades do passado podem aparecer nos exemplos", "Porque todo algoritmo usa apenas sorte"], 2, "Um modelo pode repetir padrões injustos presentes no material usado para treiná-lo."],
    ["etica", "basico", "Qual prática ajuda a proteger a privacidade?", ["Coletar apenas os dados necessários e explicar seu uso", "Publicar informações pessoais por padrão", "Guardar dados sem prazo nem finalidade", "Compartilhar senhas para facilitar auditoria"], 0, "Limitar coleta e finalidade reduz exposição desnecessária e facilita o controle das pessoas."],
    ["etica", "medio", "O que torna uma decisão apoiada por IA mais responsável?", ["Esconder quem escolheu o sistema", "Registrar critérios, permitir revisão e atribuir responsabilidade", "Usar sempre a resposta mais rápida", "Eliminar o direito de contestar"], 1, "Rastreabilidade e revisão permitem identificar erros e responder por suas consequências."],
    ["etica", "medio", "Em uma decisão com grande impacto na vida de alguém, o que significa supervisão humana real?", ["Um nome de pessoa no formulário", "Apenas receber um e-mail da IA", "Confirmar tudo sem ler", "Poder compreender, questionar e mudar a decisão"], 3, "Supervisão precisa ter informação e poder de intervenção; não basta uma aprovação automática."],
    ["etica", "avancado", "Uma ferramenta tem boa precisão média, mas erra muito mais para um grupo. O que a média esconde?", ["Que o sistema funciona em todos os casos", "Que nenhuma métrica importa", "Uma diferença de desempenho que pode produzir injustiça", "Que os dados não foram digitalizados"], 2, "Avaliar apenas o total pode ocultar danos concentrados em grupos específicos."],
    ["etica", "avancado", "Qual é a ideia de uma abordagem regulatória baseada em risco?", ["Aplicar a mesma exigência a todo uso de IA", "Exigir mais cuidados onde o potencial de dano é maior", "Deixar decisões críticas sem controle", "Proibir toda ferramenta de texto"], 1, "O nível de cuidado deve acompanhar o impacto possível do uso, especialmente em decisões sensíveis."],

    ["sociedade", "basico", "Você recebeu uma imagem muito realista com uma afirmação alarmante. Qual é o primeiro cuidado?", ["Compartilhar antes que desapareça", "Verificar origem, data e contexto em fontes confiáveis", "Confiar porque tem muitos detalhes", "Perguntar somente a quem enviou"], 1, "Realismo visual não comprova autenticidade. Origem e contexto são essenciais."],
    ["sociedade", "basico", "O que é um deepfake?", ["Uma planilha com erros", "Uma câmera antiga", "Conteúdo sintético que pode simular rosto ou voz de alguém", "Um antivírus que examina fotos"], 2, "Áudio e vídeo gerados ou alterados podem parecer autênticos e exigir verificação."],
    ["sociedade", "medio", "Por que indicar que um vídeo foi gerado por IA ajuda o público?", ["Dá contexto para avaliar a autenticidade do conteúdo", "Garante que o vídeo é verdadeiro", "Dispensa consultar outras fontes", "Impede qualquer edição futura"], 0, "Identificação de conteúdo sintético torna mais claro o que o público está vendo."],
    ["sociedade", "medio", "Uma notícia aparece em vários perfis com o mesmo texto. Isso confirma que é verdadeira?", ["Sim, repetição é prova", "Sim, se tiver comentários", "Sim, se foi compartilhada hoje", "Não; é preciso buscar fontes independentes e evidências"], 3, "Repetição pode ser simples cópia. Confirmação exige fontes independentes."],
    ["sociedade", "avancado", "O que é viés de automação?", ["A incapacidade de usar computadores", "Confiar demais na recomendação da máquina e deixar de examiná-la", "Um erro exclusivo de robôs físicos", "A preferência por escrever à mão"], 1, "Pessoas também erram quando tratam uma saída automática como autoridade sem conferir."],
    ["sociedade", "avancado", "Uma IA responde com muita certeza, mas não mostra a origem da informação. Qual é a atitude mais crítica?", ["Pedir evidências e conferir fontes primárias antes de agir", "Aceitar o tom confiante como prova", "Compartilhar para receber mais opiniões", "Trocar apenas o estilo da resposta"], 0, "Confiança no texto não substitui evidência. Decisões importantes pedem verificação."],
  ].map(([topic, level, question, options, answer, explanation], id) => ({id, topic, level, question, options, answer, explanation}));

  const state = {deck: [], index: 0, score: 0, answered: false};
  const filterIds = ["quiz-topic", "quiz-level", "quiz-length"];

  function shuffle(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    return shuffled;
  }

  function pool() {
    return bank.filter((item) => ($("quiz-topic").value === "all" || item.topic === $("quiz-topic").value)
      && ($("quiz-level").value === "all" || item.level === $("quiz-level").value));
  }

  function updateAvailability() {
    const available = pool().length;
    const count = Math.min(available, Number($("quiz-length").value));
    $("quiz-availability").textContent = `${available} ${available === 1 ? "pergunta disponível" : "perguntas disponíveis"} nesta combinação · ${count} nesta rodada.`;
    $("quiz-start").disabled = available === 0;
  }

  function buildDeck() {
    const available = pool();
    const count = Math.min(available.length, Number($("quiz-length").value));
    const chosen = [];
    const diversity = $("quiz-topic").value === "all" ? ["fundamentos", "impactos", "etica", "sociedade"]
      : $("quiz-level").value === "all" ? ["basico", "medio", "avancado"] : [];
    for (const category of shuffle(diversity)) {
      if (chosen.length >= count) break;
      const candidates = available.filter((item) => item.topic === category || item.level === category);
      if (candidates.length) chosen.push(shuffle(candidates)[0]);
    }
    chosen.push(...shuffle(available.filter((item) => !chosen.includes(item))).slice(0, count - chosen.length));
    return shuffle(chosen).map((item) => ({...item, shuffledOptions: shuffle(item.options.map((text, index) => ({text, correct: index === item.answer})))}));
  }

  function showPanel(name) {
    for (const id of ["config", "play", "result"]) $(`quiz-${id}`).hidden = id !== name;
  }

  function renderQuestion() {
    const item = state.deck[state.index];
    state.answered = false;
    $("quiz-step").textContent = `Pergunta ${state.index + 1} de ${state.deck.length}`;
    $("quiz-score").textContent = `${state.score} ${state.score === 1 ? "ponto" : "pontos"}`;
    $("quiz-progress").max = state.deck.length;
    $("quiz-progress").value = state.index;
    $("quiz-question-tag").textContent = `${topics[item.topic].label} / ${levels[item.level]}`;
    $("quiz-question").textContent = item.question;
    $("quiz-question").tabIndex = -1;
    $("quiz-options").replaceChildren();
    for (const [index, option] of item.shuffledOptions.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.textContent = `${String.fromCharCode(65 + index)}. ${option.text}`;
      button.addEventListener("click", () => answer(option, button));
      $("quiz-options").append(button);
    }
    $("quiz-feedback").hidden = true;
    $("quiz-next").disabled = true;
    $("quiz-next").innerHTML = state.index === state.deck.length - 1 ? "Ver resultado <span aria-hidden=\"true\">→</span>" : "Próxima pergunta <span aria-hidden=\"true\">→</span>";
  }

  function answer(option, selectedButton) {
    if (state.answered) return;
    state.answered = true;
    if (option.correct) state.score += 10;
    for (const [index, button] of [...$("quiz-options").children].entries()) {
      button.disabled = true;
      if (state.deck[state.index].shuffledOptions[index].correct) button.classList.add("correct");
      else if (button === selectedButton) button.classList.add("incorrect");
    }
    $("quiz-score").textContent = `${state.score} pontos`;
    $("quiz-feedback").classList.toggle("right", option.correct);
    $("quiz-feedback").classList.toggle("wrong", !option.correct);
    $("quiz-feedback-title").textContent = option.correct ? "Resposta certa · +10 pontos" : "Quase lá · +0 pontos";
    $("quiz-explanation").textContent = state.deck[state.index].explanation;
    $("quiz-feedback").hidden = false;
    $("quiz-next").disabled = false;
  }

  function finish() {
    const maximum = state.deck.length * 10;
    const percentage = state.score / maximum;
    $("quiz-final-score").textContent = String(state.score);
    $("quiz-final-total").textContent = `/ ${maximum} pontos`;
    $("quiz-result-title").textContent = percentage === 1 ? "Você dominou a rodada!" : percentage >= .6 ? "Muito bem!" : "Continue explorando.";
    $("quiz-result-copy").textContent = `Você acertou ${state.score / 10} de ${state.deck.length} perguntas. Refaça o quiz para receber uma nova seleção ou explore as referências e tente outro tema.`;
    showPanel("result");
  }

  function start() {
    state.deck = buildDeck();
    if (!state.deck.length) return;
    state.index = 0;
    state.score = 0;
    showPanel("play");
    renderQuestion();
  }

  filterIds.forEach((id) => $(id).addEventListener("change", updateAvailability));
  $("quiz-start").addEventListener("click", start);
  $("quiz-retry").addEventListener("click", start);
  $("quiz-next").addEventListener("click", () => {
    if (!state.answered) return;
    if (state.index === state.deck.length - 1) finish();
    else { state.index += 1; renderQuestion(); $("quiz-question").focus(); }
  });
  for (const id of ["quiz-change", "quiz-new-topic"]) $(id).addEventListener("click", () => { showPanel("config"); updateAvailability(); });
  updateAvailability();
})();
