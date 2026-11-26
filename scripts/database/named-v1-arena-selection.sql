BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'state',m.state,'protocol',m.protocol,'remaining',m.remaining,
  'valuations',(SELECT count(*) FROM "ArenaLiveValuation" v WHERE v."matchId"=m.id),
  'timelines',(SELECT count(*) FROM "ArenaLiveTimeline" t WHERE t."matchId"=m.id),
  'agents',coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',a.id,'account',a.account,'remaining',a.remaining) ORDER BY a.id)
    FROM "ArenaLiveAgent" a WHERE a."matchId"=m.id
  ),'[]'::jsonb),
  'cycles',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',c.id,'agentId',c."agentId",'state',c.state,'attempt',c.attempt,'bookRevision',c."bookRevision",
      'inputProtocol',c.input->'protocol','frozenAccount',c.input->'account','decision',c.decision,
      'requestId',c."requestId",'hasReservation',c.reservation IS NOT NULL,
      'generationContracts',coalesce((
        SELECT jsonb_agg(DISTINCT call#>>'{input,contract,version}')
        FROM jsonb_array_elements(c."requestAudit"->'calls') call
        WHERE call#>>'{input,contract,version}' IS NOT NULL
      ),'[]'::jsonb)
    ) ORDER BY c.id)
    FROM "ArenaLiveCycle" c WHERE c."matchId"=m.id
  ),'[]'::jsonb)
) ORDER BY m.id),'[]'::jsonb)
FROM "ArenaLiveMatch" m;
ROLLBACK;
