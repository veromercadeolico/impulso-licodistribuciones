CREATE TABLE IF NOT EXISTS canales (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  meta_semanal int NOT NULL DEFAULT 0,
  orden int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marcas (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  uniforme text NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula text UNIQUE,
  nombre text NOT NULL,
  correo text,
  rol text NOT NULL CHECK (rol IN ('admin','trade','vendedor','impulsadora','lider_canal','director','supervisor')),
  canal text REFERENCES canales(codigo),
  municipio text,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usuarios_rol_idx ON usuarios (rol) WHERE activo;

CREATE TABLE IF NOT EXISTS productos (
  item int PRIMARY KEY,
  referencia text NOT NULL,
  ean text,
  descripcion text NOT NULL,
  ml int NOT NULL,
  marca text NOT NULL,
  unidades_caja int NOT NULL DEFAULT 12,
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS puntos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  municipio text NOT NULL,
  lat double precision,
  lng double precision,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS puntos_nombre_municipio_idx ON puntos (lower(nombre), lower(municipio));

CREATE TABLE IF NOT EXISTS periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_inicio date NOT NULL UNIQUE,
  fecha_fin date NOT NULL,
  limite_solicitudes timestamp NOT NULL,
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','publicado')),
  publicado_en timestamptz
);

CREATE TABLE IF NOT EXISTS solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES periodos(id),
  vendedor_id uuid NOT NULL REFERENCES usuarios(id),
  canal text NOT NULL REFERENCES canales(codigo),
  fecha date NOT NULL,
  hora time NOT NULL,
  marca text NOT NULL REFERENCES marcas(codigo),
  punto_id uuid NOT NULL REFERENCES puntos(id),
  notas text,
  prioridad smallint CHECK (prioridad BETWEEN 1 AND 3),
  extemporanea boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  motivo_rechazo text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS solicitudes_periodo_idx ON solicitudes (periodo_id, estado);
CREATE INDEX IF NOT EXISTS solicitudes_vendedor_idx ON solicitudes (vendedor_id);

CREATE TABLE IF NOT EXISTS turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES periodos(id),
  solicitud_id uuid UNIQUE REFERENCES solicitudes(id) ON DELETE SET NULL,
  impulsadora_id uuid NOT NULL REFERENCES usuarios(id),
  canal text NOT NULL REFERENCES canales(codigo),
  punto_id uuid NOT NULL REFERENCES puntos(id),
  marca text NOT NULL REFERENCES marcas(codigo),
  uniforme text NOT NULL,
  inicio timestamp NOT NULL,
  fin timestamp NOT NULL,
  alertas jsonb NOT NULL DEFAULT '[]',
  motivo_excepcion text,
  ajuste_manual boolean NOT NULL DEFAULT false,
  publicado boolean NOT NULL DEFAULT false,
  cancelado boolean NOT NULL DEFAULT false,
  CHECK (fin > inicio)
);
CREATE INDEX IF NOT EXISTS turnos_periodo_idx ON turnos (periodo_id);
CREATE INDEX IF NOT EXISTS turnos_impulsadora_idx ON turnos (impulsadora_id, inicio);

CREATE TABLE IF NOT EXISTS cambios_turno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL REFERENCES usuarios(id),
  motivo text NOT NULL,
  detalle text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disponibilidad (
  impulsadora_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  franja text NOT NULL CHECK (franja IN ('tarde','noche')),
  PRIMARY KEY (impulsadora_id, fecha, franja)
);

CREATE TABLE IF NOT EXISTS degustacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  marca text NOT NULL REFERENCES marcas(codigo),
  presentacion text NOT NULL,
  asignado int NOT NULL CHECK (asignado > 0),
  usado int CHECK (usado >= 0),
  sobrante int CHECK (sobrante >= 0),
  UNIQUE (turno_id, marca, presentacion)
);

CREATE TABLE IF NOT EXISTS inventario_oficina (
  periodo_id uuid NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  marca text NOT NULL REFERENCES marcas(codigo),
  presentacion text NOT NULL,
  cantidad int NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  PRIMARY KEY (periodo_id, marca, presentacion)
);

CREATE TABLE IF NOT EXISTS fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contenido bytea NOT NULL,
  mime text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asistencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL REFERENCES turnos(id),
  tipo text NOT NULL CHECK (tipo IN ('entrada','salida')),
  registrado_en timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota'),
  foto_id uuid NOT NULL REFERENCES fotos(id),
  lat double precision,
  lng double precision,
  distancia_m int,
  fuera_de_rango boolean NOT NULL DEFAULT false,
  UNIQUE (turno_id, tipo)
);

CREATE TABLE IF NOT EXISTS reportes_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL UNIQUE REFERENCES turnos(id),
  enviado_en timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota'),
  observaciones text
);

CREATE TABLE IF NOT EXISTS reporte_items (
  reporte_id uuid NOT NULL REFERENCES reportes_venta(id) ON DELETE CASCADE,
  producto_item int NOT NULL REFERENCES productos(item),
  cantidad int NOT NULL CHECK (cantidad > 0),
  PRIMARY KEY (reporte_id, producto_item)
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  cuerpo text NOT NULL,
  enlace text,
  leida boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificaciones_usuario_idx ON notificaciones (usuario_id, leida, creado_en DESC);

CREATE TABLE IF NOT EXISTS correos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  para text NOT NULL,
  asunto text NOT NULL,
  cuerpo text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','error')),
  error text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intentos_login (
  ip text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intentos_login_idx ON intentos_login (ip, creado_en);

CREATE TABLE IF NOT EXISTS retroalimentacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  rol text NOT NULL,
  pantalla text,
  tipo text NOT NULL CHECK (tipo IN ('error','mejora','idea','positivo')),
  comentario text NOT NULL,
  ip text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS retroalimentacion_ip_idx ON retroalimentacion (ip, creado_en);

-- Cambios acordados con Trade Marketing (noviembre 2026). Todos son compatibles con la versión anterior.
ALTER TABLE puntos ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS obsequios text;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS grupo uuid;
ALTER TABLE degustacion ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'degustacion';
INSERT INTO marcas (codigo, nombre, uniforme) VALUES
  ('CARTA_ORO', 'Ron Viejo de Caldas Carta de Oro', 'RVC'),
  ('JUAN_CRUZ', 'Ron Viejo de Caldas Juan de la Cruz', 'RVC')
  ON CONFLICT (codigo) DO NOTHING;
UPDATE marcas SET nombre = 'Ron Viejo de Caldas Tradicional' WHERE codigo = 'RVC' AND nombre = 'Ron Viejo de Caldas';
UPDATE marcas SET nombre = 'Ron Viejo de Caldas Esencial' WHERE codigo = 'ESE' AND nombre = 'Esencial';
UPDATE marcas SET nombre = 'Cheers, crema de ron' WHERE codigo = 'CHEERS' AND nombre = 'Cheers';

-- Perfil de supervisión (solo lectura) para la gerencia.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin','trade','vendedor','impulsadora','lider_canal','director','supervisor'));

-- Competencia y publicidad del establecimiento en el reporte de ventas (noviembre 2026). Columnas nuevas y vacías: no cambian datos existentes.
ALTER TABLE reportes_venta ADD COLUMN IF NOT EXISTS competencia jsonb;
ALTER TABLE reportes_venta ADD COLUMN IF NOT EXISTS publicidad text;

-- Subperfil de cada persona del equipo (Impulso, Bodega, Oficina, Mercadeo). Columna nueva y vacía (noviembre 2026).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS subperfil text;

-- Turnos en otras áreas (Bodega, Oficina, Mercadeo) que la persona registra al llegar, sin programación (noviembre 2026).
CREATE TABLE IF NOT EXISTS turnos_area (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impulsadora_id uuid NOT NULL REFERENCES usuarios(id),
  area text NOT NULL CHECK (area IN ('bodega','oficina','mercadeo')),
  entrada_en timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Bogota'),
  entrada_foto uuid NOT NULL REFERENCES fotos(id),
  entrada_lat double precision,
  entrada_lng double precision,
  salida_en timestamp,
  salida_foto uuid REFERENCES fotos(id),
  salida_lat double precision,
  salida_lng double precision,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS turnos_area_persona_idx ON turnos_area (impulsadora_id, entrada_en);
