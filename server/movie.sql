/*
drop database if exists movie;
create database movie; 
use movie;
*/
drop table if exists posts cascade;
drop table if exists shared_urls cascade;
drop table if exists favorites cascade;
drop table if exists reviews cascade;
drop table if exists members cascade;
drop table if exists membership_requests cascade;  
drop table if exists groups cascade;
drop table if exists accounts cascade;



-- Account table to manage accounts and authentication
create table accounts (
    id serial primary key,
    name varchar(100) unique not null,
    email varchar(100) unique not null,
    password varchar(255) not null,
    token_version int default 0,
    refresh_token varchar(255),
    is_verified boolean default false,
    verification_token varchar(255)
);

-- Group table for group functionality. 
create table groups (
    id serial primary key,
    name varchar(255) unique not null,
    description text,
    owner int not null,
    created timestamp default current_timestamp,
    constraint fk_owner foreign key (owner) references accounts(id)
);

-- Members table
create table members (
    id serial primary key,
    group_id int references groups(id) on delete cascade,
    account_id int references accounts(id) on delete cascade,
    role varchar(20) default 'member',
    created_at timestamp default current_timestamp,
    unique(group_id, account_id),
    CHECK (role IN ('owner', 'member'))
);

-- Reviews table to store account-created movie reviews
create table reviews (
    id serial primary key,
    movie_id int not null,
    account_id int not null,
    review text not null,
    rating smallint check (rating between 1 and 5) not null,
    created timestamp default current_timestamp,
    constraint fk_account foreign key (account_id) references accounts(id) on delete cascade
);

-- Favorites table to manage account’s favorite movies or series
create table favorites (
    id serial primary key,
    account_id int not null,
    movie_id int not null,
    created timestamp default current_timestamp,
    constraint fk_favorite_account foreign key (account_id) references accounts(id),
    constraint unique_favorite_movie_per_account unique (account_id, movie_id)
);

-- Table to track shared URLs for favorite lists
create table shared_urls (
    id serial primary key,
    account_id int not null,
    url text unique not null,
    created timestamp default current_timestamp,
    constraint fk_shared_account foreign key (account_id) references accounts(id)
);

-- Table to manage group's post:
create table posts (
    id serial primary key,
    account_id int not null,
    group_id int not null,
    title text not null,
    description text not null,
    movie_id int,
    showtime_id int,
    created timestamp default current_timestamp,
    constraint fk_group foreign key (group_id) references groups(id) on delete cascade,
    constraint fk_account foreign key (account_id) references accounts(id) on delete cascade
);

-- Membership requests table
create table membership_requests (
    id serial primary key,
    group_id int references groups(id) on delete cascade,
    account_id int references accounts(id) on delete cascade,
    user_name VARCHAR(255),
    status varchar(20) default 'pending',
    created_at timestamp default current_timestamp,
    unique(group_id, account_id)
);


