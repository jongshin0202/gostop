/* Development build-only Training computer GO/STOP hook.
 * Protected app.js remains untouched. Other gameplay retains original logic.
 */
export function instrumentTrainingComputerGoStop(source){
 const needle="  function aiShouldGo(sc){\n    return aiGoStopDecision(engine.projectStateForViewer(state,PLAYER_B),sc).decision==='go';\n  }";
 if(typeof source!=='string'||source.split(needle).length!==2)
  throw new Error('Frozen aiShouldGo anchor changed; fail closed.');
 const replacement=[
  '  function aiShouldGo(sc){',
  '    if(presentation.trainingMode&&!onlineMode){',
  '      const dev=globalThis.GoStopDevTrainingComputerChoice;',
  '      if(dev?.choose){',
  '        try {',
  '        const suggestion=dev.choose({',
  '          deck:MASTER_DECK,floor:state?.floor,ai:state?.ai,',
  '          humanCaptured:state?.human?.captured,',
  '          humanHandCount:state?.human?.hand?.length||0,',
  '          aiScore:sc.total,humanScore:scorePlayer(state.human).total,engine',
  '        });',
  "        if(suggestion?.decision==='go'||suggestion?.decision==='stop')",
  "          return suggestion.decision==='go';",
  '        }catch(_){ /* Preserve original AI if the dev advisor fails. */ }',
  '      }',
  '    }',
  "    return aiGoStopDecision(engine.projectStateForViewer(state,PLAYER_B),sc).decision==='go';",
  '  }'
 ].join('\n');
 return source.replace(needle,replacement);
}
