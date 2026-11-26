BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
  'matches', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'protocol',m.protocol,'remaining',m.remaining,'state',m.state
  ) ORDER BY m.id) FROM "ArenaLiveMatch" m),'[]'::jsonb),
  'agents', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',a.id,'matchId',a."matchId",'providerId',a."providerId",'model',a.model,
    'remaining',a.remaining,'bookRevision',a.account->'revision'
  ) ORDER BY a.id) FROM "ArenaLiveAgent" a),'[]'::jsonb),
  'cycles', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',c.id,'matchId',c."matchId",'agentId',c."agentId",'state',c.state,'attempt',c.attempt,
    'bookRevision',c."bookRevision",'leaseUntil',c."leaseUntil",'requestId',c."requestId",
    'reservation',c.reservation,'hasInput',c.input IS NOT NULL,
    'calls',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'requestId',call->'requestId','state',call->'state','sentAt',call->'sentAt',
      'reserved',call->'reserved','used',call->'used'
    ) ORDER BY ordinal) FROM jsonb_array_elements(c."requestAudit"->'calls') WITH ORDINALITY AS calls(call,ordinal)),'[]'::jsonb)
  ) ORDER BY c.id) FROM "ArenaLiveCycle" c),'[]'::jsonb),
  'archiveRefs', coalesce((SELECT jsonb_agg(DISTINCT refs[1] ORDER BY refs[1]) FROM (
    SELECT to_jsonb(t)::text AS body FROM "ArenaLiveTimeline" t
    UNION ALL SELECT evidence::text FROM "ArenaLiveValuation"
    UNION ALL SELECT input::text FROM "ArenaLiveCycle"
    UNION ALL SELECT "requestAudit"::text FROM "ArenaLiveCycle"
  ) rows CROSS JOIN LATERAL regexp_matches(rows.body,'arena-history/[0-9a-f]{64}\.json','g') refs),'[]'::jsonb),
  'historical', jsonb_build_object(
    'matches', (SELECT count(*) FROM "ModelArena"),
    'accounts', (SELECT count(*) FROM "ArenaEntrant"),
    'rounds', (SELECT count(*) FROM "ArenaRound"),
    'fills', (SELECT count(*) FROM "ArenaFill"),
    'reservations', (SELECT count(*) FROM "ArenaReservation"),
    'occurrences', (SELECT count(*) FROM "ArenaOccurrence"),
    'researchPackets', (SELECT count(*) FROM "ArenaResearchPacket"),
    'weeks', (SELECT count(*) FROM "ArenaWeek"),
    'weeklyRevisions', (SELECT count(*) FROM "ArenaWeekRevision")
  )
);
ROLLBACK;
