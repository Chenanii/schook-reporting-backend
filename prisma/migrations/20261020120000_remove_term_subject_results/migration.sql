-- End-of-term results are recalculated from locked assessment records.
-- AnnualResultTerm depended on TermSubjectResult, so both stored-result tables
-- are removed; AnnualSubjectResult records remain intact.
DROP TABLE IF EXISTS "AnnualResultTerm";
DROP TABLE IF EXISTS "TermSubjectResult";
