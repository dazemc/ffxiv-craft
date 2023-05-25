# Final Fantasy XIV Craft (FFXIV Craft)

## Overview

Welcome to the `ffxiv-craft` repository! This is an advanced crafting tool specifically tailored for players of Final Fantasy XIV (FFXIV). The tool employs a Monte Carlo simulation to determine optimal crafting macros, streamlining your crafting experience and maximizing in-game efficiency.

Please remember that this tool is a fan-made initiative and is not officially endorsed or affiliated with Square Enix or any of its subsidiaries.

## Features

- **Crafting Macro Generator:** Through the power of Monte Carlo simulations, our tool generates highly efficient crafting macros, aiming to take the guesswork out of your crafting processes.

- **Crafting Simulator:** The in-built crafting simulator allows you to test the effectiveness of these macros before committing your in-game resources.

- **Crafting Level Tracker:** Stay on top of your game with our crafting level tracker. Plan for your progression, and target specific crafts with greater ease.

Please be aware that due to the probabilistic nature of Monte Carlo simulations, the resulting macros might vary from run to run. While the absolute optimal sequence is not guaranteed, the tool strives to produce highly successful macros consistently.

## Usage

Access to `ffxiv-craft` is straightforward and doesn't require local setup. You can use the tool by visiting the [deployed site](https://dazemc.github.io/ffxiv-craft) on GitHub. The user-friendly interface guides you through the process of generating crafting macros.

## Contributing

Community contributions and feedback are always welcome! Feel free to open an issue or submit a pull request if you have a feature request, bug report, or if you have developed a new feature that you think would benefit the wider community. Before contributing, please ensure that you read through the existing issues and pull requests to avoid duplicate entries.

## Understanding the Code: `Buffs.py`, `main.py`, and `main_scraper.py`

### Buffs.py

The `Buffs.py` module defines a class, `Buffs`, that is used to represent and manage various attributes of buffs in FFXIV. The class takes several parameters on initialization related to the various statistical bonuses provided by a buff, including:

- CP Percent (`cp_percent`): The percentage increase in CP provided by the buff.
- CP Value (`cp_value`): The absolute increase in CP provided by the buff.
- Craftsmanship Percent (`craft_percent`): The percentage increase in Craftsmanship provided by the buff.
- Craftsmanship Value (`craft_value`): The absolute increase in Craftsmanship provided by the buff.
- Control Percent (`control_percent`): The percentage increase in Control provided by the buff.
- Control Value (`control_value`): The absolute increase in Control provided by the buff.

In addition to these attributes, the `Buffs` class also takes parameters to track whether the buff is of High Quality (`hq`), and the name of the buff in different languages (`name`, `name_de`, `name_fr`, `name_ja`).

### main.py in `ranged-python-xivapi-extractor`

The `main.py` script in the `ranged-python-xivapi-extractor` directory is responsible for fetching data about various types of buffs ("Medicine" and "Meal") from the FFXIV API. This script makes a POST request to the API with a JSON payload that defines the search parameters, fetching information about buffs that provide relative increases in CP, Control, and Craftsmanship, and that do not fall under the category of the current buff type.

The script then parses the returned JSON data to create instances of the `Buffs` class for each fetched item, storing them in a list. If a buff provides different bonuses for normal and High Quality versions, two instances of the `Buffs` class are created and added to the list. This list is then dumped to a JSON file named after the current buff type, which is saved in the `out/buffs` directory.

Finally, the `main.py` script executes the `main_scraper.py` script.

### main_scraper.py

The `main_scraper.py` script is responsible for fetching and storing data about crafting recipes from the FFXIV API. The script first fetches the total number of recipes available in the game, then spawns a number of threads to fetch recipe data in parallel. The number of threads used is limited to avoid exceeding the rate limit of the API.

Each thread fetches data about recipes from a single page of the API's response, then processes the fetched data to extract relevant information and store it in a format that is usable by the crafting solver. This processed data is then added to a dictionary, with crafting jobs as the keys and lists of recipes as the values.

Once all recipe data has been fetched and processed, the script dumps the recipe dictionary to JSON files, one for each crafting job, which are saved in the `out/recipedb` directory. The script then prints a message indicating that it has finished running.

Thank you for visiting `ffxiv-craft`, and we hope you enjoy your crafting journey in Final Fantasy XIV!
