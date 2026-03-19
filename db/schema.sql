create extension if not exists postgis;

create table farmers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  telegram_id text,
  region text,
  created_at timestamptz default now()
);

create table fields (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid references farmers(id),
  name text not null,
  geometry geometry(Polygon, 4326),
  area_ha float,
  created_at timestamptz default now()
);

create table measurements (
  id uuid primary key default gen_random_uuid(),
  field_id uuid references fields(id),
  date date not null,
  ndvi float,
  ndwi float,
  cloud_cover_pct integer,
  sentinel_scene_id text,
  created_at timestamptz default now()
);