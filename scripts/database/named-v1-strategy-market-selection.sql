BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object('table','Strategy','row',to_jsonb(s)) FROM "Strategy" s ORDER BY id;
SELECT jsonb_build_object('table','StrategyVersion','row',to_jsonb(s)) FROM "StrategyVersion" s ORDER BY id;
SELECT jsonb_build_object(
  'table','BacktestJob','row',to_jsonb(b),
  'strategy',jsonb_build_object('schemaVersion',s."schemaVersion",'definition',s.schema)
) || CASE WHEN e."identityFingerprint" IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
  'referenceWindow',jsonb_build_object('identityFingerprint',e."identityFingerprint",
    'responseHash',e."completeResponseHash",'response',e."completeResponse")) END
FROM "BacktestJob" b JOIN "StrategyVersion" s ON s.id=b."strategyVersionId"
LEFT JOIN "MarketBarWindowEvidenceV3" e
  ON e."identityFingerprint"=b."runConfig"#>>'{priceResearch,actualPriceWindow,identityFingerprint}'
ORDER BY b.id;
SELECT jsonb_build_object('table','MarketBarWindowEvidenceV3','row',to_jsonb(m))
FROM "MarketBarWindowEvidenceV3" m WHERE m."completeResponse" IS NOT NULL ORDER BY m."identityFingerprint";
SELECT jsonb_build_object('table','MarketDerivedSeriesSnapshotV3','row',to_jsonb(m))
FROM "MarketDerivedSeriesSnapshotV3" m ORDER BY m."inputFingerprint";
SELECT jsonb_build_object('table','MarketReportMetadataSnapshot','row',to_jsonb(m))
FROM "MarketReportMetadataSnapshot" m ORDER BY m.id;
SELECT jsonb_build_object('table','StrategySubmission',
 'row',to_jsonb(s) || jsonb_build_object('createdAt',to_char(s."createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'job',jsonb_build_object('id',b.id,'strategyVersionId',b."strategyVersionId")))
FROM "StrategySubmission" s LEFT JOIN "BacktestJob" b ON b.id=(s.outcome->>'id')::uuid ORDER BY s.id;
SELECT jsonb_build_object('table','StrategyAuthoringRevision','row',to_jsonb(r))
FROM "StrategyAuthoringRevision" r ORDER BY r."draftId",r.revision;
SELECT jsonb_build_object('table','StrategyAuthoringOperation','row',to_jsonb(o))
FROM "StrategyAuthoringOperation" o ORDER BY o.id;
SELECT jsonb_build_object('table','AiRun','row',to_jsonb(r),
 'calls',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
   FROM "AiToolCall" c WHERE c."aiRunId"=r.id),'[]'::jsonb))
FROM "AiRun" r WHERE r."modelMetadata" ? 'frozenResearch' ORDER BY r.id;
SELECT jsonb_build_object('table','ProviderConfig','row',jsonb_build_object('id',p.id,'settings',p.settings))
FROM "ProviderConfig" p WHERE p.settings ? 'executionRoutes' ORDER BY p.id;
SELECT jsonb_build_object('table','DesiredProviderPolicy','row',to_jsonb(p))
FROM "DesiredProviderPolicy" p ORDER BY p.consumer;
SELECT jsonb_build_object('table','DesiredProviderPolicyRevision','row',to_jsonb(p))
FROM "DesiredProviderPolicyRevision" p ORDER BY p.consumer,p.revision;
SELECT jsonb_build_object('table','OptimizationExperiment','row',to_jsonb(o),
 'strategy',jsonb_build_object('schemaVersion',s."schemaVersion",'definition',s.schema))
FROM "OptimizationExperiment" o JOIN "StrategyVersion" s ON s.id=o."baselineStrategyVersionId" ORDER BY o.id;
SELECT jsonb_build_object('table','OptimizationCandidate','row',to_jsonb(o),
 'strategy',jsonb_build_object('schemaVersion',s."schemaVersion",'definition',s.schema))
FROM "OptimizationCandidate" o JOIN "StrategyVersion" s ON s.id=o."candidateStrategyVersionId" ORDER BY o.id;
SELECT jsonb_build_object('table','OptimizationAdoption','row',to_jsonb(o))
FROM "OptimizationAdoption" o ORDER BY o.id;
SELECT jsonb_build_object('table','ArenaLiveMatch','row',to_jsonb(m)) FROM "ArenaLiveMatch" m ORDER BY id;
SELECT jsonb_build_object('table','ArenaLiveCycle','row',jsonb_build_object(
  'id',id,'input',input,'state',state,'bookRevision',"bookRevision",
  'leaseUntil',"leaseUntil",'requestId',"requestId",'reservation',reservation,'decision',decision))
FROM "ArenaLiveCycle" ORDER BY id;
SELECT jsonb_build_object('table','ModelArena','row',to_jsonb(m)) FROM "ModelArena" m ORDER BY id;
ROLLBACK;
