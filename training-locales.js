/* Training Mode text only. This module never changes game state or game rules. */
'use strict';
((root)=>{
  const DATA={
  "es": {
    "title": [
      "Jugada recomendada",
      "Objetivo recomendado",
      "Consejo de selección",
      "Consejo estratégico",
      "Estrategia inicial",
      "Consejo GO / STOP",
      "Consejo de Bomba",
      "Consejo de Shake"
    ],
    "types": [
      "Brillante",
      "Imagen",
      "Cinta",
      "Simple",
      "Pájaro",
      "Doble Simple",
      "Copa de sake"
    ],
    "stripes": [
      "Roja",
      "Azul",
      "Lisa"
    ],
    "families": [
      "Pino",
      "Ciruelo",
      "Cerezo",
      "Enredadera",
      "Iris",
      "Rosa",
      "Arbusto",
      "Colina",
      "Margarita",
      "Estrella",
      "Baya",
      "Sauce"
    ],
    "phrases": [
      "Juega {card} para capturar {target}.",
      "Juega {card}.",
      "Elige {target} en la mesa.",
      "El mejor objetivo era {target}.",
      "Es la única captura disponible.",
      "Usa la carta de mayor valor de tu mano.",
      "Te acerca a completar 5-BIRDIES.",
      "Asegura una carta Brillante.",
      "Te acerca a completar las tres Cintas {stripe}.",
      "Este grupo de tres Cintas ya no puede completarse.",
      "Cuenta como dos Simples.",
      "La Copa puede contar como dos Simples.",
      "Impide que la computadora complete 5-BIRDIES.",
      "Impide que la computadora complete las tres Cintas {stripe}.",
      "Completa 5-BIRDIES.",
      "Completa las tres Cintas {stripe}.",
      "Alcanzas tres Brillantes y empiezas a puntuar.",
      "Alcanzas cinco Imágenes y empiezas a puntuar.",
      "Alcanzas cinco Cintas y empiezas a puntuar.",
      "Alcanzas diez Simples y empiezas a puntuar.",
      "Tu puntuación aumenta.",
      "Guarda la carta más valiosa para después.",
      "Es la opción de menor riesgo para dejar en la mesa.",
      "Estrategia recomendada: {strategies}.",
      "Prioriza los Simples y Dobles Simples.",
      "Toca o haz clic para continuar.",
      "Bomba: captura las cuatro cartas de la familia y gana dos turnos opcionales de solo robar.",
      "Shake: si ganas, el resultado final se multiplica por {multiplier}.",
      "GO: todavía tienes oportunidades de puntuar.",
      "STOP: asegura ahora {points} puntos.",
      "La computadora puede llegar a la puntuación ganadora en su próximo turno.",
      "La computadora ya tiene {points} puntos.",
      "Quedan pocas oportunidades para puntuar.",
      "Usa la Copa como dos Simples.",
      "Usa la Copa como Imagen.",
      "Sigue el movimiento resaltado."
    ]
  },
  "fr": {
    "title": [
      "Coup conseillé",
      "Cible conseillée",
      "Conseil de sélection",
      "Conseil stratégique",
      "Stratégie de départ",
      "Conseil GO / STOP",
      "Conseil Bombe",
      "Conseil Shake"
    ],
    "types": [
      "Brillante",
      "Image",
      "Ruban",
      "Simple",
      "Oiseau",
      "Double Simple",
      "Coupe de saké"
    ],
    "stripes": [
      "Rouge",
      "Bleu",
      "Uni"
    ],
    "families": [
      "Pin",
      "Prunier",
      "Cerisier",
      "Glycine",
      "Iris",
      "Rose",
      "Buisson",
      "Colline",
      "Marguerite",
      "Étoile",
      "Baie",
      "Saule"
    ],
    "phrases": [
      "Jouez {card} pour prendre {target}.",
      "Jouez {card}.",
      "Choisissez {target} sur la table.",
      "La meilleure cible était {target}.",
      "C’est la seule prise possible.",
      "Jouez la carte de main de plus grande valeur.",
      "Vous vous rapprochez de 5-BIRDIES.",
      "Prenez une Brillante.",
      "Vous vous rapprochez du trio de Rubans {stripe}.",
      "Ce trio de Rubans ne peut plus être complété.",
      "Cette carte compte comme deux Simples.",
      "La Coupe peut compter comme deux Simples.",
      "Empêchez l’ordinateur de compléter 5-BIRDIES.",
      "Empêchez l’ordinateur de compléter le trio de Rubans {stripe}.",
      "Vous complétez 5-BIRDIES.",
      "Vous complétez le trio de Rubans {stripe}.",
      "Vous atteignez trois Brillantes et commencez à marquer.",
      "Vous atteignez cinq Images et commencez à marquer.",
      "Vous atteignez cinq Rubans et commencez à marquer.",
      "Vous atteignez dix Simples et commencez à marquer.",
      "Votre score augmente.",
      "Gardez la carte la plus précieuse pour plus tard.",
      "C’est le choix le moins risqué à laisser sur la table.",
      "Stratégie conseillée : {strategies}.",
      "Privilégiez les Simples et Doubles Simples.",
      "Touchez ou cliquez pour continuer.",
      "Bombe : prenez les quatre cartes de la même famille et gagnez deux tours facultatifs sans poser de carte.",
      "Shake : si vous gagnez, votre score final est multiplié par {multiplier}.",
      "GO : vous pouvez encore marquer.",
      "STOP : assurez maintenant {points} points.",
      "L’ordinateur peut atteindre le score gagnant au prochain tour.",
      "L’ordinateur a déjà {points} points.",
      "Il reste peu de chances de marquer.",
      "Utilisez la Coupe comme deux Simples.",
      "Utilisez la Coupe comme Image.",
      "Suivez le coup surligné."
    ]
  },
  "de": {
    "title": [
      "Empfohlener Zug",
      "Empfohlene Zielkarte",
      "Auswahlhinweis",
      "Strategiehinweis",
      "Startstrategie",
      "GO-/STOP-Hinweis",
      "Bombenhinweis",
      "Shake-Hinweis"
    ],
    "types": [
      "Lichtkarte",
      "Bildkarte",
      "Bandkarte",
      "Einzelkarte",
      "Vogelkarte",
      "Doppelte Einzelkarte",
      "Sake-Becher"
    ],
    "stripes": [
      "Rot",
      "Blau",
      "Einfarbig"
    ],
    "families": [
      "Kiefer",
      "Pflaume",
      "Kirsche",
      "Ranke",
      "Iris",
      "Rose",
      "Busch",
      "Hügel",
      "Gänseblümchen",
      "Stern",
      "Beere",
      "Weide"
    ],
    "phrases": [
      "Spiele {card}, um {target} zu fangen.",
      "Spiele {card}.",
      "Wähle {target} auf dem Tisch.",
      "Das bessere Ziel war {target}.",
      "Dies ist die einzige mögliche Aufnahme.",
      "Spiele die höherwertige Handkarte.",
      "So kommst du 5-BIRDIES näher.",
      "Sichere dir eine Lichtkarte.",
      "Damit kommst du dem {stripe}-Dreierband näher.",
      "Dieser Dreierband-Satz ist nicht mehr möglich.",
      "Diese Karte zählt als zwei Einzelkarten.",
      "Der Becher kann als zwei Einzelkarten zählen.",
      "Verhindere, dass der Computer 5-BIRDIES vervollständigt.",
      "Verhindere, dass der Computer den {stripe}-Dreierband-Satz vervollständigt.",
      "Damit vervollständigst du 5-BIRDIES.",
      "Damit vervollständigst du den {stripe}-Dreierband-Satz.",
      "Du erreichst drei Lichtkarten und beginnst zu punkten.",
      "Du erreichst fünf Bildkarten und beginnst zu punkten.",
      "Du erreichst fünf Bandkarten und beginnst zu punkten.",
      "Du erreichst zehn Einzelkarten und beginnst zu punkten.",
      "Dein Punktestand steigt.",
      "Behalte die wertvollere Karte für später.",
      "Diese Karte ist am wenigsten riskant zum Ablegen.",
      "Empfohlene Strategie: {strategies}.",
      "Sammle zunächst Einzelkarten und doppelte Einzelkarten.",
      "Tippe oder klicke, um fortzufahren.",
      "Bombe: Fange alle vier Karten der Familie und erhalte zwei optionale Züge ohne Handkarte.",
      "Shake: Wenn du gewinnst, wird dein Endergebnis mit {multiplier} multipliziert.",
      "GO: Du hast noch Chancen auf weitere Punkte.",
      "STOP: Sichere jetzt {points} Punkte.",
      "Der Computer könnte im nächsten Zug die Siegpunktzahl erreichen.",
      "Der Computer hat bereits {points} Punkte.",
      "Es bleiben nur wenige Chancen auf Punkte.",
      "Nutze den Becher als zwei Einzelkarten.",
      "Nutze den Becher als Bildkarte.",
      "Folge dem hervorgehobenen Zug."
    ]
  },
  "ja": {
    "title": [
      "おすすめの一手",
      "おすすめの取り札",
      "選択のヒント",
      "作戦のヒント",
      "最初の作戦",
      "GO・STOP の助言",
      "ボムの助言",
      "シェイクの助言"
    ],
    "types": [
      "光札",
      "タネ札",
      "短冊",
      "カス札",
      "鳥のタネ札",
      "二枚分のカス札",
      "菊の杯"
    ],
    "stripes": [
      "赤短",
      "青短",
      "草短"
    ],
    "families": [
      "松",
      "梅",
      "桜",
      "藤",
      "菖蒲",
      "牡丹",
      "萩",
      "薄",
      "菊",
      "紅葉",
      "桐",
      "柳"
    ],
    "phrases": [
      "手札の{card}を出し、場の{target}を取ってください。",
      "手札の{card}を出してください。",
      "場の{target}を選んでください。",
      "よりよい目標は{target}でした。",
      "今取れる札はこれだけです。",
      "価値の高い手札を先に使います。",
      "五鳥（5-BIRDIES）に近づきます。",
      "光札を確保します。",
      "{stripe}の三枚組に近づきます。",
      "この三枚組はもう完成できません。",
      "この札はカス札二枚分です。",
      "菊の杯はカス札二枚分として使えます。",
      "相手の五鳥完成を防ぎます。",
      "相手の{stripe}三枚組完成を防ぎます。",
      "五鳥（5-BIRDIES）が完成します。",
      "{stripe}三枚組が完成します。",
      "光札を三枚そろえて得点できます。",
      "タネ札が五枚になり、得点できます。",
      "短冊が五枚になり、得点できます。",
      "カス札が十枚になり、得点できます。",
      "得点が増えます。",
      "価値の高い札を手元に残します。",
      "場に残すリスクが最も小さい札です。",
      "おすすめの作戦：{strategies}。",
      "まずカス札と二枚分のカス札を集めましょう。",
      "準備ができたら画面をタップしてください。",
      "ボム：同じ月の四枚を取り、手札を出さずに山札を引ける機会が二回増えます。",
      "シェイク：勝てば最終得点が{multiplier}倍になります。",
      "GO：まだ追加得点を狙えます。",
      "STOP：今の{points}点を確保しましょう。",
      "相手は次の番で勝利条件に達する可能性があります。",
      "相手はすでに{points}点です。",
      "追加得点の機会はわずかです。",
      "菊の杯をカス札二枚分として使いましょう。",
      "菊の杯をタネ札として使いましょう。",
      "強調表示された札を確認してください。"
    ]
  },
  "zh": {
    "title": [
      "推荐出牌",
      "推荐目标牌",
      "选牌提示",
      "策略提示",
      "开局策略",
      "GO / STOP 建议",
      "炸弹建议",
      "Shake 建议"
    ],
    "types": [
      "光牌",
      "图片牌",
      "彩带牌",
      "普通牌",
      "鸟牌",
      "双倍普通牌",
      "菊花酒杯"
    ],
    "stripes": [
      "红带",
      "蓝带",
      "素带"
    ],
    "families": [
      "松",
      "梅",
      "樱",
      "藤",
      "鸢尾",
      "牡丹",
      "萩",
      "芒草",
      "菊",
      "枫",
      "桐",
      "柳"
    ],
    "phrases": [
      "打出手中的{card}，收取桌上的{target}。",
      "打出手中的{card}。",
      "选择桌上的{target}。",
      "更好的目标是{target}。",
      "这是目前唯一能收取的牌。",
      "优先打出价值更高的手牌。",
      "更接近凑齐 5-BIRDIES。",
      "收取光牌。",
      "离凑齐三张{stripe}更近一步。",
      "这组三张彩带牌已无法凑齐。",
      "这张牌按两张普通牌计分。",
      "酒杯可按两张普通牌计分。",
      "阻止电脑凑齐 5-BIRDIES。",
      "阻止电脑凑齐三张{stripe}。",
      "凑齐了 5-BIRDIES。",
      "凑齐了三张{stripe}。",
      "收集到三张光牌，开始得分。",
      "收集到五张图片牌，开始得分。",
      "收集到五张彩带牌，开始得分。",
      "收集到十张普通牌，开始得分。",
      "这一手会增加分数。",
      "把更有价值的牌留在手中。",
      "这是留在桌上风险最低的牌。",
      "建议开局策略：{strategies}。",
      "优先收集普通牌和双倍普通牌。",
      "准备好后点击屏幕继续。",
      "炸弹：一次收取同组四张牌，额外获得两次只抽牌的机会。",
      "Shake：如果获胜，最终得分乘以 {multiplier}。",
      "GO：仍有机会获得更多分数。",
      "STOP：现在锁定 {points} 分。",
      "电脑下一回合可能达到获胜分数。",
      "电脑已有 {points} 分。",
      "剩余得分机会很少。",
      "将酒杯当作两张普通牌。",
      "将酒杯当作图片牌。",
      "请按照高亮建议出牌。"
    ]
  }
};
  const TITLES=['Recommended Move','Target Choice','Target Feedback','Strategy Note','Opening Strategy','GO / STOP ADVICE','BOMB ADVICE','SHAKE ADVICE'];
  const fill=(template,vars={})=>String(template||'').replace(/\{(\w+)\}/g,(_,key)=>vars[key]??'');
  function cardName(locale,card){
    const d=DATA[locale];if(!d||!card)return '';
    const family=d.families[card.month-1]||String(card.month);
    const kind=card.id==='m9-1'&&card.flags?.includes('switchPi')?d.types[6]:
      card.flags?.includes('doublePi')?d.types[5]:
      card.type==='bright'?d.types[0]:
      card.type==='ribbon'?d.stripes[{red:0,blue:1,grass:2}[card.ribbonSet]??2]+' '+d.types[2]:
      card.flags?.includes('godori')?d.types[4]:card.type==='animal'?d.types[1]:d.types[3];
    return ['ja','zh'].includes(locale)?family+kind:family+' '+kind;
  }
  function reason(locale,c){
    const d=DATA[locale];if(!c)return '';
    const p=d.phrases,t=c.target,profile=c.profile||{};
    const stripe=d.stripes[{red:0,blue:1,grass:2}[t?.ribbonSet]??2];
    if(!t)return p[c.discardContext?.retainedFamily?.length?21:22];
    if(c.threat&&/completing (?:its .* Stripe set|5-BIRDIES)/.test(c.threat)&&!c.opportunity&&!(c.urgency?.immediateScoreGain>0))return c.threat.includes('5-BIRDIES')?p[12]:fill(p[13],{stripe});
    if(c.onlyAvailableCapture&&t.type==='animal'&&!t.flags?.includes('godori')&&!c.opportunity)return p[4];
    if(t.flags?.includes('godori')&&profile.godoriRoute?.alive)return p[6];
    if(t.type==='bright')return p[7];
    if(c.card?.flags?.includes('godori')&&profile.godoriRoute?.alive)return p[6];
    const o=c.opportunity||'';
    const match=o.match(/This completes the (Red|Blue|Plain) Stripe set/);
    if(o.includes('5-BIRDIES'))return p[14];
    if(match)return fill(p[15],{stripe:d.stripes[{Red:0,Blue:1,Plain:2}[match[1]]]});
    if(o.includes('3 Brights'))return p[16];
    if(o.includes('5 Pictures'))return p[17];
    if(o.includes('5 Stripes'))return p[18];
    if(o.includes('10 Singles'))return p[19];
    if(o.includes('visible score'))return p[20];
    if(c.urgency?.familyLock&&c.shortWhy==='This uses the higher-value hand card.')return p[5];
    if(t.type==='ribbon'){
      const route=profile.ribbonRoutes?.[t.ribbonSet];
      if(route&&!route.alive)return p[9];
      if(route?.potentialCount>=2)return fill(p[8],{stripe});
    }
    if(t.flags?.includes('doublePi'))return p[10];
    if(t.flags?.includes('switchPi'))return p[11];
    if(c.onlyAvailableCapture)return p[4];
    return '';
  }
  function render(locale,title,original,ctx={}){
    const d=DATA[locale];if(!d)return null;
    const p=d.phrases,name=d.title[Math.max(0,TITLES.indexOf(title))];
    if(title==='Opening Strategy'){
      const options=ctx.opening?.strategyOptions||[];
      const strategies=options.map(o=>o.type==='stripe'?d.stripes[{red:0,blue:1,grass:2}[o.family]??2]+' '+d.types[2]:o.type==='bright'?d.types[0]:'5-BIRDIES');
      return {title:name,text:(strategies.length?fill(p[23],{strategies:strategies.join(', ')}):p[24])+' '+p[25]};
    }
    if(title==='BOMB ADVICE')return {title:name,text:p[26]};
    if(title==='SHAKE ADVICE')return {title:name,text:fill(p[27],{multiplier:String(original||'').match(/×([24])/)?.[1]||2})};
    if(title==='GO / STOP ADVICE'){
      const stop=String(original||'').startsWith('STOP'),detail=String(original||'');
      const first=stop?fill(p[29],{points:ctx.goStop?.points??0}):p[28];
      const extra=!stop?'':detail.includes('The computer is at')?p[30]:detail.includes('already has')?fill(p[31],{points:ctx.goStop?.opponent??0}):detail.includes('Only one scoring turn')?p[32]:'';
      return {title:name,text:[first,extra].filter(Boolean).join(' ')};
    }
    const c=ctx.recommendation;
    if(!c?.card)return {title:name,text:p[35]};
    const target=cardName(locale,c.target),why=reason(locale,c);
    const action=title==='Target Choice'?fill(p[2],{target}):title==='Target Feedback'?fill(p[3],{target}):
      c.target?fill(p[0],{card:cardName(locale,c.card),target}):fill(p[1],{card:cardName(locale,c.card)});
    return {title:name,text:[action,why].filter(Boolean).join(' ')};
  }
  function gukjin(locale,advice){
    if(locale==='ko'&&advice)return advice.mode==='pi'?'국진 술잔을 쌍피로 사용하세요.':'국진 술잔을 열끗으로 사용하세요.';
    const d=DATA[locale];if(!d||!advice)return null;
    return d.phrases[advice.mode==='pi'?33:34];
  }
  const api=Object.freeze({locales:Object.freeze(Object.keys(DATA)),cardName,render,gukjin});
  root.GoStopTrainingLocales=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
