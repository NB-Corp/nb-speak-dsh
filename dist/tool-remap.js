                                     
                            
                      
                          
                                  
                                                  
    
 

                                 
                       
                          
                         
                       
                           
                                
    
 

                                
                        
                             
                         
                                 
                                                  
                                      
 

/**
 * Reserved tool names used by nb-speak's user-facing bubble & artifact protocol
 * (or specialized Split-Phase voice models). When DSH passes internal subagent
 * orchestration tools with colliding names (`send_message`), we transparently
 * remap DSH's tool to `agent_send_message` on the way to the model and restore
 * `agent_send_message` -> `send_message` on the way back to DSH!
 */
const RESERVED_PROTOCOL_ALIASES                                   = {
  send_message: 'agent_send_message',
  send_artifact: 'ext_send_artifact',
  send_code_or_doc: 'ext_send_code_or_doc',
  calc_python: 'ext_calc_python',
  run_python: 'ext_run_python',
};

const DEFAULT_REVERSE_ALIASES                                   = {
  agent_send_message: 'send_message',
  ext_send_artifact: 'send_artifact',
  ext_send_code_or_doc: 'send_code_or_doc',
  ext_calc_python: 'calc_python',
  ext_run_python: 'run_python',
};

                                 
                                                   
                                                     
                                                
 

function allocateUpstreamName(original        , taken                     )         {
  const preferred = RESERVED_PROTOCOL_ALIASES[original];
  if (!preferred) return original;
  let candidate = preferred;
  let suffix = 2;
  while (taken.has(candidate) || candidate in RESERVED_PROTOCOL_ALIASES) {
    candidate = `${preferred}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function buildToolRemapTable(rawTools                                )                 {
  const toUpstream = new Map                ();
  const fromUpstream = new Map                ();

  if (!rawTools || rawTools.length === 0) {
    for (const [orig, alias] of Object.entries(RESERVED_PROTOCOL_ALIASES)) {
      toUpstream.set(orig, alias);
      fromUpstream.set(alias, orig);
    }
    return { toUpstream, fromUpstream, tools: [] };
  }

  const existingNames = new Set        ();
  for (const item of rawTools) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item                           ;
    const fn =
      typeof rec.function === 'object' && rec.function !== null ? (rec.function                           ) : rec;
    if (typeof fn.name === 'string' && fn.name.trim()) {
      existingNames.add(fn.name.trim());
    }
  }

  const taken = new Set        (existingNames);
  const rewritten                       = [];

  for (const item of rawTools) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item                           ;
    const fn =
      typeof rec.function === 'object' && rec.function !== null ? (rec.function                           ) : rec;
    const origName = typeof fn.name === 'string' ? fn.name.trim() : '';
    if (!origName) continue;

    let upstreamName = origName;
    if (origName in RESERVED_PROTOCOL_ALIASES) {
      upstreamName = allocateUpstreamName(origName, taken);
      taken.add(upstreamName);
      toUpstream.set(origName, upstreamName);
      fromUpstream.set(upstreamName, origName);
    }

    rewritten.push({
      type: 'function',
      function: {
        name: upstreamName,
        ...(typeof fn.description === 'string' ? { description: fn.description } : {}),
        parameters:
          typeof fn.parameters === 'object' && fn.parameters !== null
            ? (fn.parameters                           )
            : { type: 'object', properties: {} },
      },
    });
  }

  return { toUpstream, fromUpstream, tools: rewritten };
}

export function mapToolNameToUpstream(name        , table                )         {
  return table.toUpstream.get(name) ?? RESERVED_PROTOCOL_ALIASES[name] ?? name;
}

export function restoreToolNameFromUpstream(name        , table                 )         {
  if (table?.fromUpstream.has(name)) {
    return table.fromUpstream.get(name) ;
  }
  return DEFAULT_REVERSE_ALIASES[name] ?? name;
}

export function remapMessagesToUpstream(
  messages                          ,
  table                ,
)                  {
  return messages.map((msg) => {
    let next                = msg;

    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      let changed = false;
      const mappedCalls = msg.tool_calls.map((tc) => {
        const orig = tc.function?.name;
        if (!orig) return tc;
        const mapped = mapToolNameToUpstream(orig, table);
        if (mapped === orig) return tc;
        changed = true;
        return { ...tc, function: { ...tc.function, name: mapped } };
      });
      if (changed) next = { ...next, tool_calls: mappedCalls };
    }

    if (msg.role === 'tool' && typeof msg.name === 'string') {
      const mapped = mapToolNameToUpstream(msg.name, table);
      if (mapped !== msg.name) next = { ...next, name: mapped };
    }

    return next;
  });
}

export function restoreOpenAIToolCalls(
  toolCalls                                       ,
  table                 ,
)                               {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((tc) => {
    const rawName = tc.function?.name;
    if (!rawName) return tc;
    const restored = restoreToolNameFromUpstream(rawName, table);
    if (restored === rawName) return tc;
    return { ...tc, function: { ...tc.function, name: restored } };
  });
}
