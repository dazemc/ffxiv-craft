import requests
import json
import math
import threading
from pathlib import Path
from collections import defaultdict

# TODO: Need a way to trigger only when there is an update to api.
# I will add a check to compare total buffs/recipes.
# For now it will auto update at noon UTC, git push, or when a pull request is issued.

# Buffs Endpoint
BUFFS_API_URL = "https://xivapi.com/search"
buff_types = ["Medicine", "Meals"]
RECIPE_API_URL = 'https://xivapi.com/Recipe'
PARENT_DIR = Path(__file__).parents[1]


def construct_recipe_json(original_recipe):
    """
    Returns a recipe dictionary in the format desired by the FFXIV crafting solver.
    Rewriting how it handles all the data is a monumental task, so instead I'm just going to do this.
    """
    if original_recipe["RecipeLevelTable"] is None:
        return
    recipe = {
        "name": {},
        "baseLevel": original_recipe["RecipeLevelTable"]["ClassJobLevel"],
        "level": original_recipe["RecipeLevelTable"]["ID"],
        "difficulty": math.floor(
            original_recipe["RecipeLevelTable"]["Difficulty"] * original_recipe["DifficultyFactor"] / 100),
        "durability": math.floor(
            original_recipe["RecipeLevelTable"]["Durability"] * original_recipe["DurabilityFactor"] / 100),
        "maxQuality": math.floor(
            original_recipe["RecipeLevelTable"]["Quality"] * original_recipe["QualityFactor"] / 100),
        "suggestedCraftsmanship": original_recipe["RecipeLevelTable"]["SuggestedCraftsmanship"],
        "progressDivider": original_recipe["RecipeLevelTable"]["ProgressDivider"],
        "progressModifier": original_recipe["RecipeLevelTable"]["ProgressModifier"],
        "qualityDivider": original_recipe["RecipeLevelTable"]["QualityDivider"],
        "qualityModifier": original_recipe["RecipeLevelTable"]["QualityModifier"],
    }
    recipe["name"]["en"] = original_recipe["Name_en"]
    recipe["name"]["de"] = original_recipe["Name_de"]
    recipe["name"]["fr"] = original_recipe["Name_fr"]
    recipe["name"]["ja"] = original_recipe["Name_ja"]
    if original_recipe["RecipeLevelTable"]["Stars"] != 0:
        recipe["stars"] = original_recipe["RecipeLevelTable"]["Stars"]
    return recipe


def get_total_pages():
    """
    Gets the total amount of recipe pages that exist!
    """
    r = requests.get(RECIPE_API_URL)
    recipe_data = r.json()
    return recipe_data['Pagination']['PageTotal']


def api_call(page_id, recipes):
    """
    Handles the actual API calls.
    """
    url_call = f'https://xivapi.com/Recipe?page={page_id}&columns=Name_en,Name_de,Name_fr,Name_ja,' \
               f'ClassJob.NameEnglish,DurabilityFactor,QualityFactor,DifficultyFactor,RequiredControl,' \
               f'RequiredCraftsmanship,RecipeLevelTable'
    r = requests.get(url_call)
    page_data = r.json()
    if r.status_code == 429:
        print("Too many requests sent to XIVAPI!")

    for recipe in page_data['Results']:
        key = recipe['ClassJob']['NameEnglish']
        constructed_recipe = construct_recipe_json(recipe)
        if constructed_recipe:
            recipes[key].append(constructed_recipe)


def handle_api_calls(pages_amount):
    """
    Handle API calls with multi-threading, since XIVAPI is rate limited to 20.
    """
    recipes = defaultdict(list)
    threads = []
    for i in range(1, pages_amount + 1):
        t = threading.Thread(target=api_call, args=(i, recipes))
        threads.append(t)
        t.start()
        if i % 20 == 0:
            for t in threads:
                t.join()
            threads = []
    for t in threads:
        t.join()
    return recipes


def save_data_to_json(recipes):
    """
    Save recipes data to a .json file
    """
    Path(f'{PARENT_DIR}/data/recipedb/').mkdir(parents=True, exist_ok=True)
    for class_job, class_recipes in recipes.items():
        # Sort the recipes, to ensure that for the same set
        # of recipes, we always generate a byte-identical
        # file.
        class_recipes.sort(key=lambda class_recipe: class_recipe["name"]["en"])
        with open(f"{PARENT_DIR}/data/recipedb/{class_job}.json", mode="w", encoding="utf-8") as my_file:
            json.dump(class_recipes, my_file, indent=2, sort_keys=True, ensure_ascii=False)


def extract_buff_data(buff_name):
    """
    Extracts buff data for the given buff_name
    """
    params = {
        "indexes": "item",
        "columns": "Name,Bonuses,Name_en,Name_de,Name_fr,Name_ja",
        "body": {
            "query": {
                "bool": {
                    "should": [
                        {"match": {"Bonuses.CP.Relative": "true"}},
                        {"match": {"Bonuses.Control.Relative": "true"}},
                        {"match": {"Bonuses.Craftsmanship.Relative": "true"}}

                    ],
                    "must_not": [
                        {"match": {"ItemSearchCategory.Name_en": buff_name}}

                    ]
                }
            },
            "from": 0,
            "size": 100
        }
    }
    request = requests.post(BUFFS_API_URL, json=params)
    request.raise_for_status()

    buffs = []
    for item in request.json()["Results"]:
        bonuses = item.get("Bonuses")
        if bonuses is None:
            # Skip items that do not have any bonuses.
            # This should not be possible (as the query should only return
            # results that have at least one bonus), but we check anyway to
            # simplify the code below.
            continue
        # Extract both HQ and NQ buff data
        for hq, attr_suffix in ((False, ""), (True, "HQ")):
            def _get(stat_name, attribute):
                return bonuses.get(stat_name, {}).get(attribute + attr_suffix)
            new_item = {
                "cp_percent": _get("CP", "Value"),
                "cp_value": _get("CP", "Max"),
                "craftsmanship_percent": _get("Craftsmanship", "Value"),
                "craftsmanship_value": _get("Craftsmanship", "Max"),
                "control_percent": _get("Control", "Value"),
                "control_value": _get("Control", "Max"),
                "hq": hq,
                "name": {
                    "en": item.get("Name"),
                    "de": item.get("Name_de"),
                    "fr": item.get("Name_fr"),
                    "ja": item.get("Name_ja"),
                },
            }

            # Remove None values from previous step
            new_item = {k: v for k, v in new_item.items() if v is not None}
            buffs.append(new_item)
    return buffs


def save_buffs_to_file(buffs, buff_name):
    """
    Save buffs data to a .json file
    """
    Path(f'{PARENT_DIR}/data/buffs').mkdir(parents=True, exist_ok=True)
    # Sort the buffs (by english name, then NQ/HQ), to ensure that for the same
    # set of buff, we always generate a byte-identical file.
    buffs.sort(key=lambda buff: (buff["name"]["en"], buff["hq"]))
    with open(f"{PARENT_DIR}/data/buffs/{buff_name}.json", mode="w", encoding="utf-8") as my_file:
        json.dump(buffs, my_file, indent=2, sort_keys=True, ensure_ascii=False)


if __name__ == '__main__':
    pages_amount = get_total_pages()
    recipes = handle_api_calls(pages_amount)
    save_data_to_json(recipes)

    # for buff_name in buff_types:
    #     buffs = extract_buff_data(buff_name)
    #     # Because of the way xivapi serves data, the call is != to the category name.
    #     # Probably a cleaner way to do it but it works.
    #     if buff_name == "Medicine":
    #         buff_name = "Meal"
    #     else:
    #         buff_name = "Medicine"
    #     save_buffs_to_file(buffs, buff_name)
