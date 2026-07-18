alter table ventures
add column feature_file_paths text[] not null default '{}';
