CREATE TABLE IF NOT EXISTS scjn_tesis (
    registro_digital TEXT PRIMARY KEY,
    numero_identificacion TEXT,
    tesis TEXT,
    rubro TEXT,
    texto TEXT,
    epoca TEXT,
    anio TEXT,
    mes TEXT,
    instancia TEXT,
    organo TEXT,
    materia TEXT,
    tipo TEXT,
    asunto TEXT,
    ponente TEXT,
    formas_integracion TEXT,
    fuente TEXT,
    localizacion TEXT,
    publicacion TEXT,
    nota_publicacion TEXT,
    precedentes TEXT,
    certificado_digital TEXT,
    source TEXT,
    import_batch_id TEXT,
    imported_at TIMESTAMPTZ,
    last_updated_at TIMESTAMPTZ,
    last_import_batch_id TEXT,
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('spanish', coalesce(rubro, '') || ' ' || coalesce(texto, '') || ' ' || coalesce(tesis, '') || ' ' || coalesce(precedentes, ''))
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_scjn_tesis_search_vector ON scjn_tesis USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_scjn_tesis_epoca ON scjn_tesis(epoca);
CREATE INDEX IF NOT EXISTS idx_scjn_tesis_instancia ON scjn_tesis(instancia);
CREATE INDEX IF NOT EXISTS idx_scjn_tesis_materia ON scjn_tesis(materia);
CREATE INDEX IF NOT EXISTS idx_scjn_tesis_tipo ON scjn_tesis(tipo);

CREATE TABLE IF NOT EXISTS scjn_import_batches (
    id TEXT PRIMARY KEY,
    filename TEXT,
    source TEXT,
    category TEXT,
    imported_at TIMESTAMPTZ,
    row_count INTEGER,
    inserted_count INTEGER,
    updated_count INTEGER,
    skipped_count INTEGER,
    csv_sha256 TEXT,
    acuse_filename TEXT,
    official_certificate TEXT,
    notes TEXT
);
