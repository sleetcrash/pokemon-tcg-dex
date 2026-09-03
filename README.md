# Pokemon National Card Dex Tracker

Tracker for collecting the National Card Dex in the Pokemon TCG. 

## Overview

The National Dex lists every Pokemon across all generations and regions. Collecting the National Dex means collecting a card for each of them. 

This is a free, comprehensive and open source way to manage your National Dex Card collection. It combines a few necessary tools into one:
- Keep track of the cards already in your collection, and quickly see which cards you’re still missing.
- Avoid buying duplicates by marking cards you’ve purchased as Pending until they’re delivered.
- Quickly find where new cards slot into your existing collection.
- Choose how to manage Form variations with filters and sorting options.

## TCG vs VG

While a true National Dex strictly by Dex number is the same however you slice it, the forms and variations that can be collected as a card vs in a mainline game have crucial differences.

- A National Dex (or Living Form Dex) is limited in the mainline games to Home compatibility and whether a Pokemon is in a ‘boxable form’. Mega Evolved Pokemon cannot be boxed, so they cannot be included as a separate form in your collection. The TCG, however, does have cards for Megas and G-Max that you can collect.
- Not every form has been released (I don’t think) so some gaps may persist. 


## Features

Comprehensive National Dex: 
- All 1,025 Pokemon (through Legends ZA)
- All Regional Forms (ex: Hisuian Arcanine)
- Base Form Variations (ex: Deerling/Sawsbuck seasonal forms)
- Mega Evolutions (ex: Mega Dragonite).

Quick Reference:
- Filter by generation, region, form, and collection status.
- Form entries can be shown separately or collapsed under their base Pokemon.
- Search for a Pokemon to jump to its spot on the list. (It’s more of a ‘Find’ than a ‘Search’).

Intuitive Collection Management: 
- Tap to Register a card to your collection.
- Long press (mobile) or right click (desktop) to mark as Pending (helpful for tracking cards purchased but not delivered).
- View as a list or in a binder. 
- Save multiple lists (I have a separate list for only AR/SIR, another for mixed rarity).
(Note: Share lists across devices with a unique list identifier. Auto sync planned for a future update.)

## Roadmap

- Living Form Dex: Male / female variants
- Regional Dex: Dex for each region/generation
- Physical Card Lookup: Search the actual card you want to add to your collection, and see that card in the binder. 
- Auto sync across devices.
- Use camera or photos to find a card in the list. 

## Why Pokemon National Dex tracker?

I wanted to collect a card for every Pokemon and quickly found I needed a way to track my progress, including sorting my collection, tracking cards I had purchased but hadn’t received yet, and quickly adding new cards to my collection in the right spot as I got them. This is my solution. 

I built this for me to use personally, but figured I would keep it available in case anyone else wanted to go down this path. There are other trackers out there, but the most useful required making an account and paying a subscription. None of that is necessary here. All Pokemon are freely available for you to track. 

## Thanks

This would not be possible without PokeAPI: https://github.com/PokeAPI/pokeapi

Sprites are the official game sprites served by the PokeAPI sprites repository (https://github.com/PokeAPI/sprites): FireRed/LeafGreen for Kanto, HeartGold/SoulSilver for Johto, Emerald for Hoenn, Platinum for Sinnoh, Black/White for Unova, Omega Ruby/Alpha Sapphire for Kalos, Ultra Sun/Ultra Moon for Alola, and Pokemon HOME renders for Galar, Paldea, and everything newer. A HOME-renders-everywhere option lives in the gear menu. No fan-made sprites are used.
