drop table if exists shared_urls;
drop table if exists favorites;
drop table if exists ratings;
drop table if exists reviews;
drop table if exists members;
drop table if exists groups;
drop table if exists accounts;

-- Account table to manage accounts and authentication
create table accounts (
    id serial primary key,
    name varchar(100) unique not null,
    email varchar(100) unique not null,
    password varchar(255) not null
);

-- Group table for group functionality. 
-- When the owner deletes their account, transfer the ownership to another group member, if available.
-- If no other members exist, delete the group.
create table groups (
    id serial primary key,
    name varchar(255) unique not null,
    description text,
    owner int not null,
    created timestamp default current_timestamp,
    constraint fk_owner foreign key (owner) references accounts(id) on delete cascade
);

-- Members table to track membership in groups. 
-- The Owner can assign who becomes an admin.
-- Admins and Owners can add or remove members, delete members'reviews.
create table members (
    id serial primary key,
    group_id int not null,
    account_id int not null,
    role varchar(50) check (role in ('member', 'admin')) default 'member',
    constraint fk_group foreign key (group_id) references groups(id),
    constraint fk_account foreign key (account_id) references accounts(id)
);

-- Reviews table to store account-created movie reviews. Movie_id is ID retrieved form IMDB API
create table reviews (
    id serial primary key,
    movie_id int not null,
    account_id int not null,
    review text not null,
    created timestamp default current_timestamp,
    constraint fk_account foreign key (account_id) references accounts(id) on delete cascade
);

-- Ratings table to store account-created movie ratings. Movie ID is from TMDB
-- If the accoounts is deleted, its ratings are kept, and account_id field is null.
create table ratings (
    id serial primary key,
    movie_id int not null,
    account_id int,
    rating smallint check (rating between 1 and 5),
    created timestamp default current_timestamp,
    constraint fk_account foreign key (account_id) references accounts(id) on delete set null
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
