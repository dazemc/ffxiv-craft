//require('./String.js');
/* Adding new actions search for STEP_##
    * Add action to AllActions object STEP_01
    * Add action effect to ApplySpecialActionEffects STEP_02
    * Add action counter to UpdateEffectCounters STEP_03
*/

/* ToDo
    * Implement Heavensward actions
 */

function LogOutput() {
    this.log = '';
}

LogOutput.prototype.write = function (s) {
    this.log += s;
};

LogOutput.prototype.clear = function () {
    this.log = '';
};

function Logger(logOutput) {
    this.logOutput = logOutput;
}

Logger.prototype.log = function (myString) {
    var args = Array.prototype.slice.call(arguments, 1);
    var msg = String.prototype.sprintf.apply(myString, args);
    if (this.logOutput !== undefined && this.logOutput !== null) {
        this.logOutput.write(msg + '\n');
    }
    else {
        console.log(msg);
    }
};

function Crafter(cls, level, craftsmanship, control, craftPoints, specialist, actions) {
    this.cls = cls;
    this.craftsmanship = craftsmanship;
    this.control = control;
    this.craftPoints = craftPoints;
    this.level = level;
    this.specialist = specialist;
    if (actions === null) {
        this.actions = [];
    }
    else {
        this.actions = actions;
    }
}

function Recipe(baseLevel, level, difficulty, durability, startQuality, safetyMargin, maxQuality, suggestedCraftsmanship, progressDivider, progressModifier, qualityDivider, qualityModifier, stars) {
    this.baseLevel = baseLevel;
    this.level = level;
    this.difficulty = difficulty;
    this.durability = durability;
    this.startQuality = startQuality;
    this.safetyMargin = safetyMargin || 0;
    this.maxQuality = maxQuality;
    this.suggestedCraftsmanship = suggestedCraftsmanship || SuggestedCraftsmanship[this.level];
    this.progressDivider = progressDivider;
    this.progressModifier = progressModifier;
    this.qualityDivider = qualityDivider;
    this.qualityModifier = qualityModifier;
    this.stars = stars;
}

// Extra solver vars that the synth needs to take into account
function SolverVars(solveForCompletion, remainderCPFitnessValue, remainderDurFitnessValue) {
    this.solveForCompletion = solveForCompletion;
    this.remainderCPFitnessValue = remainderCPFitnessValue;
    this.remainderDurFitnessValue = remainderDurFitnessValue;
}

function Synth(crafter, recipe, maxTrickUses, reliabilityIndex, useConditions, maxLength, solverVars) {
    this.crafter = crafter;
    this.recipe = recipe;
    this.maxTrickUses = maxTrickUses;
    this.useConditions = useConditions;
    this.reliabilityIndex = reliabilityIndex;
    this.maxLength = maxLength;
    this.solverVars = solverVars;
}

Synth.prototype.calculateBaseProgressIncrease = function (effCrafterLevel, craftsmanship) {
    //var levelDifferenceFactor = getLevelDifferenceFactor('craftsmanship', levelDifference);
    //return Math.floor((levelDifferenceFactor * (0.21 * craftsmanship + 2) * (10000 + craftsmanship)) / (10000 + this.recipe.suggestedCraftsmanship))
    // EDIT - endwalker update - taken from teamcraft simulator.es5.js
    var baseValue = (craftsmanship * 10) / this.recipe.progressDivider + 2;
    if (effCrafterLevel <= this.recipe.level) {
        return Math.floor((baseValue * (this.recipe.progressModifier || 100)) / 100);
    }
    return Math.floor(baseValue);

};

Synth.prototype.calculateBaseQualityIncrease = function (effCrafterLevel, control) {
    //var levelDifferenceFactor = getLevelDifferenceFactor('control', levelDifference);
    //return Math.floor((levelDifferenceFactor * (0.35 * control + 35) * (10000 + control)) / (10000 + this.recipe.suggestedControl))
    var baseValue = (control * 10) / this.recipe.qualityDivider + 35;
    if (effCrafterLevel <= this.recipe.level) {
        return Math.floor((baseValue * (this.recipe.qualityModifier || 100)) / 100);
    }
    return Math.floor(baseValue);
};

function isActionEq(action1, action2) {
    return action1.shortName === action2.shortName;
}

function isActionNe(action1, action2) {
    return action1.shortName !== action2.shortName;
}

function getComboAction(comboName) {
    // Look up abilities by name.
    let actionKey = Object.keys(AllActions).find(key => AllActions[key].shortName == comboName)
    // return the full action that matches.
    return AllActions[actionKey];
}

function EffectTracker() {
    this.countUps = {};
    this.countDowns = {};
    this.indefinites = {};
}

function State(synth, step, lastStep, action, durabilityState, cpState, bonusMaxCp, qualityState, progressState, wastedActions, trickUses, reliability, effects, condition, touchComboStep) {
    this.synth = synth;
    this.step = step;
    this.lastStep = lastStep;
    this.action = action;   // the action leading to this State
    this.durabilityState = durabilityState;
    this.cpState = cpState;
    this.bonusMaxCp = bonusMaxCp;
    this.qualityState = qualityState;
    this.progressState = progressState;
    this.wastedActions = wastedActions;
    this.trickUses = trickUses;
    this.reliability = reliability;
    this.effects = effects;
    this.condition = condition;

    // Advancedtouch combo stuff
    this.touchComboStep = touchComboStep;


    // Internal state variables set after each step.
    this.iqCnt = 0;
    this.control = 0;
    this.qualityGain = 0;
    this.bProgressGain = 0;
    this.bQualityGain = 0;
    this.success = 0;
    this.lastDurabilityCost = 0;
}

State.prototype.clone = function () {
    return new State(this.synth, this.step, this.lastStep, this.action, this.durabilityState, this.cpState, this.bonusMaxCp, this.qualityState, this.progressState, this.wastedActions, this.trickUses, this.reliability, clone(this.effects), this.condition, this.touchComboStep);
};

State.prototype.checkViolations = function () {
    // Check for feasibility violations
    var progressOk = false;
    var cpOk = false;
    var durabilityOk = false;
    var trickOk = false;
    var reliabilityOk = false;

    if (this.progressState >= this.synth.recipe.difficulty) {
        progressOk = true;
    }

    if (this.cpState >= 0) {
        cpOk = true;
    }

    /* Ranged edit - original
    // Consider removing sanity check in UpdateState
    if ((this.durabilityState >= 0) && (this.progressState >= this.synth.recipe.difficulty)) {
        durabilityOk = true;
    }
    */

    // Ranged edit -- 10 cost actions that bring you to -5 are now valid
    if ((this.durabilityState >= -15) && (this.progressState >= this.synth.recipe.difficulty)) {
        // Special allowed cases that bring it to the negatives:
        // This should really be condensed into a single if statement but lol lmao
        if (this.lastDurabilityCost === 10 && this.durabilityState === -5) {
            durabilityOk = true;
        }
        if (this.lastDurabilityCost === 20 && (this.durabilityState === -5 || this.durabilityState === -10 || this.durabilityState === -15)) {
            durabilityOk = true;
        }
        // All other cases:
        if (this.durabilityState >= 0) {
            durabilityOk = true;
        }
    }

    if (this.trickUses <= this.synth.maxTrickUses) {
        trickOk = true;
    }

    if (this.reliability >= this.synth.reliabilityIndex) {
        reliabilityOk = true;
    }

    return {
        progressOk: progressOk,
        cpOk: cpOk,
        durabilityOk: durabilityOk,
        trickOk: trickOk,
        reliabilityOk: reliabilityOk
    };
};

function NewStateFromSynth(synth) {
    var step = 0;
    var lastStep = 0;
    var durabilityState = synth.recipe.durability;
    var cpState = synth.crafter.craftPoints;
    var bonusMaxCp = 0;
    var qualityState = synth.recipe.startQuality;
    var progressState = 0;
    var wastedActions = 0;
    var trickUses = 0;
    var reliability = 1;
    var effects = new EffectTracker();
    effects.countUps["innerQuiet"] = -1; // Endwalker: Inner Quiet at the start
    // We start this at -1 because +1 gets added everywhere
    // this makes sense because I'm bad at javascript idk
    // works tho
    var condition = 'Normal';
    var touchComboStep = 0;


    return new State(synth, step, lastStep, '', durabilityState, cpState, bonusMaxCp, qualityState, progressState, wastedActions, trickUses, reliability, effects, condition, touchComboStep);
}

function probGoodForSynth(synth) {
    var recipeLevel = synth.recipe.level;
    var qualityAssurance = synth.crafter.level >= 63;
    if (recipeLevel >= 300) { // 70*+
        return qualityAssurance ? 0.11 : 0.10;
    }
    else if (recipeLevel >= 276) { // 65+
        return qualityAssurance ? 0.17 : 0.15;
    }
    else if (recipeLevel >= 255) { // 61+
        return qualityAssurance ? 0.22 : 0.20;
    }
    else if (recipeLevel >= 150) { // 60+
        return qualityAssurance ? 0.11 : 0.10;
    }
    else if (recipeLevel >= 136) { // 55+
        return qualityAssurance ? 0.17 : 0.15;
    }
    else {
        return qualityAssurance ? 0.27 : 0.25;
    }
}

function probExcellentForSynth(synth) {
    var recipeLevel = synth.recipe.level;
    if (recipeLevel >= 300) { // 70*+
        return 0.01;
    }
    else if (recipeLevel >= 255) { // 61+
        return 0.02;
    }
    else if (recipeLevel >= 150) { // 60+
        return 0.01;
    }
    else {
        return 0.02;
    }
}

function getEffectiveCrafterLevel(synth) {
    var effCrafterLevel = synth.crafter.level;
    if (LevelTable[synth.crafter.level]) {
        effCrafterLevel = LevelTable[synth.crafter.level];
    }
    return effCrafterLevel;
}

function ApplyModifiers(s, action, condition) {
    // Effect Modifiers
    //=================
    var craftsmanship = s.synth.crafter.craftsmanship;
    var control = s.synth.crafter.control;
    var cpCost = action.cpCost;

    // Effects modifying level difference
    var effCrafterLevel = getEffectiveCrafterLevel(s.synth);
    var effRecipeLevel = s.synth.recipe.level;
    var levelDifference = effCrafterLevel - effRecipeLevel;
    var originalLevelDifference = effCrafterLevel - effRecipeLevel;
    var pureLevelDifference = s.synth.crafter.level - s.synth.recipe.baseLevel;
    var recipeLevel = effRecipeLevel;
    var stars = s.synth.recipe.stars;
    var durabilityCost = action.durabilityCost;

    // Effects modifying probability
    var successProbability = action.successProbability;
    successProbability = Math.min(successProbability, 1);

    // Advanced Touch Combo
    if (isActionEq(action, AllActions.advancedTouch)) {
        if (s.action.shortName === "standardTouch" && s.touchComboStep === 1) {
            s.touchComboStep = 0;
            cpCost = 18;
        } else if (s.action.shortName === "observe") {
            cpCost = 18;
        }
    }
    // Add combo bonus following Basic Touch
    if (isActionEq(action, AllActions.standardTouch)) {
        if (s.action.shortName === "basicTouch") {
            cpCost = 18;
            s.touchComboStep = 1;
        }
    }

    // Penalize use of WasteNot during solve for completion runs
    if ((isActionEq(action, AllActions.wasteNot) || isActionEq(action, AllActions.wasteNot2)) && s.synth.solverVars.solveForCompletion) {
        s.wastedActions += 50;
    }

    // Effects modifying progress increase multiplier
    var progressIncreaseMultiplier = 1;

    if ((action.progressIncreaseMultiplier > 0) && (s.effects.countDowns.hasOwnProperty(AllActions.muscleMemory.shortName))) {
        progressIncreaseMultiplier += 1;
        delete s.effects.countDowns[AllActions.muscleMemory.shortName];
    }

    if (AllActions.veneration.shortName in s.effects.countDowns) {
        progressIncreaseMultiplier += 0.5;
    }

    if (isActionEq(action, AllActions.muscleMemory)) {
        if (s.step !== 1) {
            s.wastedActions += 1;
            progressIncreaseMultiplier = 0;
            cpCost = 0;
        }
        if (s.step === 1) {
            s.wastedActions -= 1;
        }
    }

    // Effects modifying durability cost
    if ((AllActions.wasteNot.shortName in s.effects.countDowns) || (AllActions.wasteNot2.shortName in s.effects.countDowns)) {
        if (isActionEq(action, AllActions.prudentTouch)) {
            bQualityGain = 0;
            s.wastedActions += 1;
        }
        else if (isActionEq(action, AllActions.prudentSynthesis)) {
            bProgressGain = 0;
            s.wastedActions += 1;
        }
        else {
            durabilityCost *= 0.5;
        }
    }

    if (AllActions.trainedPerfection.shortName in s.effects.countDowns) {
        // If we burned our "free durability" buff on something already free...
        if (durabilityCost === 0 || action.durabilityCost === 0) {
            s.effects.countDowns.trainedPerfection += 1;
        }
        if (action.isCombo) {
            durabilityCost -= 10;
            AllActions.trainedPerfection.durSaved = 10;
        } else {
            durabilityCost = 0;
            AllActions.trainedPerfection.durSaved = action.durabilityCost;
        }
    }


    if (s.durabilityState < durabilityCost) {
        if (isActionEq(action, AllActions.groundwork) || isActionEq(action, AllActions.groundwork2)) {
            progressIncreaseMultiplier *= 0.5;
            s.wastedActions += 0.5;
        }
    }


    // Effects modifying quality increase multiplier
    var qualityIncreaseMultiplier = 1;
    var qualityIncreaseMultiplierIQ = 1; // This is calculated separately because it's multiplicative instead of additive! See: how teamcraft does it

    if ((AllActions.greatStrides.shortName in s.effects.countDowns) && (qualityIncreaseMultiplier > 0)) {
        qualityIncreaseMultiplier += 1;
    }

    if (AllActions.innovation.shortName in s.effects.countDowns) {
        qualityIncreaseMultiplier += 0.5;
    }

    if ("innerQuiet" in s.effects.countUps) {
        qualityIncreaseMultiplierIQ += (0.1 * (s.effects.countUps["innerQuiet"] + 1))
        // +1 because buffs start incrementing from 0
    }

    // We can only use Byregot actions when we have at least 1 stacks of inner quiet
    if (isActionEq(action, AllActions.byregotsBlessing)) {
        if (("innerQuiet" in s.effects.countUps) && s.effects.countUps["innerQuiet"] >= 1) {
            qualityIncreaseMultiplier *= 1 + Math.min((0.2 * (s.effects.countUps["innerQuiet"] + 1)), 3);
        } else {
            qualityIncreaseMultiplier = 0;
        }
    }

    // Calculate base and modified progress gain
    var bProgressGain = s.synth.calculateBaseProgressIncrease(effCrafterLevel, craftsmanship);
    bProgressGain = Math.floor(bProgressGain * action.progressIncreaseMultiplier * progressIncreaseMultiplier);


    // Calculate base and modified quality gain
    var bQualityGain = s.synth.calculateBaseQualityIncrease(effCrafterLevel, control);
    bQualityGain = Math.floor(bQualityGain * action.qualityIncreaseMultiplier * qualityIncreaseMultiplier * qualityIncreaseMultiplierIQ);

    // Trained finesse
    if (isActionEq(action, AllActions.trainedFinesse)) {
        // Not at 10 stacks of IQ -> wasted action
        if (!("innerQuiet" in s.effects.countUps) || s.effects.countUps["innerQuiet"] != 9) {
            s.wastedActions += 1;
            bQualityGain = 0;
        }
    }

    // Effects modifying quality gain directly
    if (isActionEq(action, AllActions.trainedEye)) {
        if ((s.step === 1) && (pureLevelDifference >= 10) && !s.synth.recipe.stars) {
            bQualityGain = s.synth.recipe.maxQuality;
        }
        else {
            s.wastedActions += 1;
            bQualityGain = 0;
            cpCost = 0;
        }
    }

    // We can only use Precise Touch when state material condition is Good or Excellent. Default is true for probabilistic method.
    if (isActionEq(action, AllActions.preciseTouch)) {
        if (condition.checkGoodOrExcellent()) {
            bQualityGain *= condition.pGoodOrExcellent();
        } else {
            s.wastedActions += 1;
            bQualityGain = 0;
            cpCost = 0;
        }
    }

    if (isActionEq(action, AllActions.reflect)) {
        if (s.step !== 1) {
            s.wastedActions += 1;
            control = 0;
            bQualityGain = 0;
            cpCost = 0;
        }
        if (s.step === 1) {
            s.wastedActions -= 1;
        }
    }

    if (isActionEq(action, AllActions.trainedPerfection)) {
        s.wastedActions += 1;
        delete s.effects.countDowns[AllActions.trainedPerfection.shortName];
    }

    return {
        craftsmanship: craftsmanship,
        control: control,
        effCrafterLevel: effCrafterLevel,
        effRecipeLevel: effRecipeLevel,
        levelDifference: levelDifference,
        successProbability: successProbability,
        qualityIncreaseMultiplier: qualityIncreaseMultiplier,
        bProgressGain: bProgressGain,
        bQualityGain: bQualityGain,
        durabilityCost: durabilityCost,
        cpCost: cpCost
    };
}

function useConditionalAction(s, condition) {
    if (s.cpState > 0 && condition.checkGoodOrExcellent()) {
        s.trickUses += 1;
        return true;
    }
    else {
        s.wastedActions += 1;
        return false;
    }
}

function ApplySpecialActionEffects(s, action, condition) {
    // STEP_02
    // Effect management
    //==================================
    // Special Effect Actions
    if (isActionEq(action, AllActions.mastersMend)) {
        s.durabilityState += 30;
        if (s.synth.solverVars.solveForCompletion) {
            s.wastedActions += 50; // Bad code, but it works. We don't want dur increase in solve for completion.
        }
    }

    if (isActionEq(action, AllActions.immaculateMend)) {
        // Set durability to max durability for the recipe
        s.durabilityState = s.synth.recipe.durability;
        if (s.synth.solverVars.solveForCompletion) {
            s.wastedActions += 50; // Bad code, but it works. We don't want dur increase in solve for completion.
        }
    }

    if ((AllActions.manipulation.shortName in s.effects.countDowns) && (s.durabilityState > 0) && !isActionEq(action, AllActions.manipulation)) {
        s.durabilityState += 5;
        if (s.synth.solverVars.solveForCompletion) {
            s.wastedActions += 50; // Bad code, but it works. We don't want dur increase in solveforcompletion.
        }
    }

    if (isActionEq(action, AllActions.byregotsBlessing)) {
        if ("innerQuiet" in s.effects.countUps) {
            delete s.effects.countUps["innerQuiet"];
        }
        else {
            s.wastedActions += 1;
        }
    }

    if (isActionEq(action, AllActions.reflect)) {
        if (s.step == 1) {
            s.effects.countUps["innerQuiet"] = 1;
        } else {
            s.wastedActions += 1;
        }
    }

    if ((action.qualityIncreaseMultiplier > 0) && (AllActions.greatStrides.shortName in s.effects.countDowns)) {
        delete s.effects.countDowns[AllActions.greatStrides.shortName];
    }

    // Manage effects with conditional requirements
    if (action.onExcellent || action.onGood) {
        if (useConditionalAction(s, condition)) {
            if (isActionEq(action, AllActions.tricksOfTheTrade)) {
                s.cpState += 20 * condition.pGoodOrExcellent();
            }
        }
    }

    if (isActionEq(action, AllActions.veneration.shortName) && (AllActions.veneration.shortName in s.effects.countDowns)) {
        s.wastedActions += 1
    }
    if (isActionEq(action, AllActions.innovation.shortName) && (AllActions.innovation.shortName in s.effects.countDowns)) {
        s.wastedActions += 1
    }

}

function UpdateEffectCounters(s, action, condition, successProbability) {
    // STEP_03
    // Countdown / Countup Management
    //===============================
    // Decrement countdowns
    for (var countDown in s.effects.countDowns) {
        s.effects.countDowns[countDown] -= 1;

        if (s.effects.countDowns[countDown] === 0) {
            delete s.effects.countDowns[countDown];
        }
    }

    if ("innerQuiet" in s.effects.countUps) {
        // Increment inner quiet countups that have conditional requirements
        if (isActionEq(action, AllActions.preparatoryTouch)) {
            s.effects.countUps["innerQuiet"] += 2;
        }
        else if (s.action === AllActions.basicTouch.shortName && isActionEq(action, AllActions.refinedTouch)) {
            s.effects.countUps["innerQuiet"] += 2;
        }
        // Increment inner quiet countups that have conditional requirements
        else if (isActionEq(action, AllActions.preciseTouch) && condition.checkGoodOrExcellent()) {
            s.effects.countUps["innerQuiet"] += 2 * successProbability * condition.pGoodOrExcellent();
        }
        // Increment all other inner quiet count ups
        else if (action.qualityIncreaseMultiplier > 0 && !isActionEq(action, AllActions.reflect) && !isActionEq(action, AllActions.trainedFinesse)) {
            s.effects.countUps["innerQuiet"] += 1 * successProbability;
        }

        // Cap inner quiet stacks at 9 (10)
        s.effects.countUps["innerQuiet"] = Math.min(s.effects.countUps["innerQuiet"], 9);
    }

    // Initialize new effects after countdowns are managed to reset them properly
    if (action.type === 'countup') {
        s.effects.countUps[action.shortName] = 0;
    }

    if (action.type === 'indefinite') {
        if (isActionEq(action, AllActions.initialPreparations)) {
            if (s.step == 1) {
                s.effects.indefinites[action.shortName] = true;
            }
            else {
                s.wastedActions += 1;
            }
        }
        else {
            s.effects.indefinites[action.shortName] = true;
        }
    }

    if (action.type === 'countdown') {
        if (action.shortName === AllActions.muscleMemory.shortName && s.step != 1) {
            s.wastedActions += 1;
        }
        else {
            s.effects.countDowns[action.shortName] = action.activeTurns;
        }
    }
}

function UpdateState(s, action, progressGain, qualityGain, durabilityCost, cpCost, condition, successProbability) {
    // State tracking
    s.progressState += progressGain;
    s.qualityState += qualityGain;
    s.durabilityState -= durabilityCost;
    s.lastDurabilityCost = durabilityCost;
    s.cpState -= cpCost;
    s.lastStep += 1;
    ApplySpecialActionEffects(s, action, condition);
    UpdateEffectCounters(s, action, condition, successProbability);

    // Sanity checks for state variables
    /* Removing this for solveForCompletion, hopefully it doesn't cause issues! :)
    if ((s.durabilityState >= -5) && (s.progressState >= s.synth.recipe.difficulty)) {
        //s.durabilityState = 0;
    }
    */
    s.durabilityState = Math.min(s.durabilityState, s.synth.recipe.durability);
    s.cpState = Math.min(s.cpState, s.synth.crafter.craftPoints + s.bonusMaxCp);
}

function simSynth(individual, startState, assumeSuccess = false, verbose = true, debug = false, logOutput = null) {
    // Logger setup
    const logger = new Logger(logOutput);

    // Clone startState to keep startState immutable
    const s = startState.clone();

    // Conditions
    const ignoreConditionReq = !s.synth.useConditions;
    let ppGood = probGoodForSynth(s.synth);
    let ppExcellent = probExcellentForSynth(s.synth);
    let ppPoor = 0;
    let ppNormal = 1 - (ppGood + ppExcellent + ppPoor);

    const SimCondition = {
        checkGoodOrExcellent: () => true,
        pGoodOrExcellent: () => ignoreConditionReq ? 1 : ppGood + ppExcellent
    };

    // Initialize tracking for once per sequence actions
    const usedActions = new Set();

    // Logging headers
    if (debug || verbose) {
        const logHeader = debug
            ? '%-2s %30s %-5s %-5s %-8s %-8s %-5s %-8s %-8s %-5s %-5s %-5s'
            : '%-2s %30s %-5s %-5s %-8s %-8s %-5s';
        const logValues = debug
            ? '%2d %30s %5.0f %5.0f %8.1f %8.1f %5.1f %8.1f %8.1f %5.0f %5.0f %5.0f'
            : '%2d %30s %5.0f %5.0f %8.1f %8.1f %5.1f';

        logger.log(logHeader, '#', 'Action', 'DUR', 'CP', 'EQUA', 'EPRG', 'IQ', 'CTL', 'QINC', 'BPRG', 'BQUA', 'WAC');
        logger.log(logValues, s.step, '', s.durabilityState, s.cpState, s.qualityState, s.progressState, 0, s.synth.crafter.control, 0, 0, 0, 0);
    }

    for (let i = 0; i < individual.length; i++) {
        const action = individual[i];

        if (!action) {
            // Skip undefined or null actions
            if (verbose) logger.log(`Skipping undefined action at index ${i}.`);
            continue;
        }

        // Handle combos if applicable
        const actionsArray = action.isCombo
            ? action.comboActions.map(actionName => AllActions[actionName]).filter(act => act !== undefined && act !== null)
            : [action];

        for (const act of actionsArray) {
            if (!act) {
                // Skip undefined or null combo actions
                if (verbose) logger.log(`Skipping undefined combo action for ${action.name}.`);
                continue;
            }

            s.step += 1;

            // Condition Calculation
            let condQualityIncreaseMultiplier = 1;
            if (!ignoreConditionReq) {
                condQualityIncreaseMultiplier *= (ppNormal + 1.5 * ppGood * Math.pow(1 - (ppGood + ppGood) / 2, s.synth.maxTrickUses) + 4 * ppExcellent + 0.5 * ppPoor);
            }

            // Apply action and update state
            const result = ApplyModifiers(s, act, SimCondition);
            const successProbability = assumeSuccess ? 1 : result.successProbability;
            const progressGain = Math.floor(successProbability * result.bProgressGain);
            const qualityGain = Math.floor(successProbability * condQualityIncreaseMultiplier * result.bQualityGain);

            if (((s.progressState >= s.synth.recipe.difficulty) || (s.durabilityState <= 0) || (s.cpState < 0)) && (act !== AllActions.dummyAction)) {
                s.wastedActions += 1;
            } else {
                UpdateState(s, act, progressGain, qualityGain, result.durabilityCost, result.cpCost, SimCondition, successProbability);

                // Update condition probabilities
                if (!ignoreConditionReq) {
                    ppPoor = ppExcellent;
                    ppGood = ppGood * ppNormal;
                    ppExcellent = ppExcellent * ppNormal;
                    ppNormal = 1 - (ppGood + ppExcellent + ppPoor);
                }
            }

            if (debug || verbose) {
                const iqCnt = s.effects.countUps["innerQuiet"] || 0;
                const logValues = debug
                    ? '%2d %30s %5.0f %5.0f %8.1f %8.1f %5.1f %8.1f %8.1f %5.0f %5.0f %5.0f'
                    : '%2d %30s %5.0f %5.0f %8.1f %8.1f %5.1f';
                logger.log(logValues, s.step, act.name, s.durabilityState, s.cpState, s.qualityState, s.progressState, iqCnt, result.control, qualityGain, Math.floor(result.bProgressGain), Math.floor(result.bQualityGain), s.wastedActions);
            }

            s.action = act.shortName;

            // Mark action as used if it is oncePerSequence
            if (act.oncePerSequence) {
                usedActions.add(act.name);
            }
        }
    }

    // Check and remove extra instances of actions with oncePerSequence
    const countActions = {};
    individual.forEach(action => {
        const name = action.name;
        countActions[name] = countActions[name] ? countActions[name] + 1 : 1;
    });

    for (let i = individual.length - 1; i >= 0; i--) {
        const action = individual[i];

        if (action.oncePerSequence && countActions[action.name] > 1) {
            individual.splice(i, 1); // Remove extra instance
            countActions[action.name]--; // Decrease count
        } else {
            usedActions.add(action.name); // Mark action as used
        }
    }

    // Check for feasibility violations
    const chk = s.checkViolations();
    if (debug || verbose) {
        logger.log('Progress Check: %s, Durability Check: %s, CP Check: %s, Tricks Check: %s, Reliability Check: %s, Wasted Actions: %d', chk.progressOk, chk.durabilityOk, chk.cpOk, chk.trickOk, chk.reliabilityOk, s.wastedActions);
    }

    // Return final state
    if (individual.length > 0) {
        s.action = individual[individual.length - 1].shortName;
    }
    return s;
}




function MonteCarloStep(startState, action, assumeSuccess, verbose, debug, logOutput) {
    verbose = verbose !== undefined ? verbose : true;
    debug = debug !== undefined ? debug : false;
    logOutput = logOutput !== undefined ? logOutput : null;

    var logger = new Logger(logOutput);

    // Clone startState to keep startState immutable
    var s = startState.clone();

    // Conditions
    var pGood = probGoodForSynth(s.synth);
    var pExcellent = probExcellentForSynth(s.synth);
    var ignoreConditionReq = !s.synth.useConditions;
    var randomizeConditions = !ignoreConditionReq;

    var MonteCarloCondition = {
        checkGoodOrExcellent: function () {
            if (ignoreConditionReq) {
                return true;
            }
            else {
                return (s.condition == 'Good' || s.condition == 'Excellent');
            }
        },
        pGoodOrExcellent: function () {
            return 1;
        }
    };

    // Initialize counters
    s.step += 1;

    // Condition Evaluation
    var condQualityIncreaseMultiplier = 1;
    if (s.condition === 'Excellent') {
        condQualityIncreaseMultiplier *= 4.0;
    }
    else if (s.condition === 'Good') {
        condQualityIncreaseMultiplier *= 1.5;
    }
    else if (s.condition === 'Poor') {
        condQualityIncreaseMultiplier *= 0.5;
    }
    else {
        condQualityIncreaseMultiplier *= 1.0;
    }

    // Calculate Progress, Quality and Durability gains and losses under effect of modifiers
    var r = ApplyModifiers(s, action, MonteCarloCondition);

    // Success or Failure
    var success = 0;
    var successRand = Math.random();
    if (0 <= successRand && successRand <= r.successProbability) {
        success = 1;
    }

    if (assumeSuccess) {
        success = 1;
    }

    // Calculate final gains / losses
    var progressGain = success * r.bProgressGain;
    if (progressGain > 0) {
        s.reliability = s.reliability * r.successProbability;
    }

    var qualityGain = success * condQualityIncreaseMultiplier * r.bQualityGain;

    // Floor gains at final stage before calculating expected value
    progressGain = Math.floor(progressGain);
    qualityGain = Math.floor(qualityGain);

    // Occur if a dummy action
    //==================================
    if ((s.progressState >= s.synth.recipe.difficulty || s.durabilityState <= 0 || s.cpState < 0) && action != AllActions.dummyAction) {
        s.wastedActions += 1;
    }
    // Occur if not a dummy action
    //==================================
    else {
        UpdateState(s, action, progressGain, qualityGain, r.durabilityCost, r.cpCost, MonteCarloCondition, success);
    }

    // Ending condition update
    if (s.condition === 'Excellent') {
        s.condition = 'Poor';
    }
    else if (s.condition === 'Good' || s.condition === 'Poor') {
        s.condition = 'Normal';
    }
    else if (s.condition === 'Normal') {
        if (randomizeConditions) {
            var condRand = Math.random();
            if (0 <= condRand && condRand < pExcellent) {
                s.condition = 'Excellent';
            }
            else if (pExcellent <= condRand && condRand < (pExcellent + pGood)) {
                s.condition = 'Good';
            }
            else {
                s.condition = 'Normal';
            }
        }
        else {
            s.condition = 'Normal';
        }
    }

    // Check for feasibility violations
    var chk = s.checkViolations();

    var iqCnt = 0;
    if ("innerQuiet" in s.effects.countUps) {
        iqCnt = s.effects.countUps["innerQuiet"];
    }

    // Add internal state variables for later output of best and worst cases
    s.action = action.shortName;
    s.iqCnt = iqCnt;
    s.control = r.control;
    s.qualityGain = qualityGain;
    s.bProgressGain = Math.floor(r.bProgressGain);
    s.bQualityGain = Math.floor(r.bQualityGain);
    s.success = success;

    if (debug) {
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %5.0f %5.0f %5.0f %5.0f %5.0f %-10s %5.0f', s.step, action.name, s.durabilityState, s.cpState, s.qualityState, s.progressState, s.iqCnt, s.control, s.qualityGain, s.bProgressGain, s.bQualityGain, s.wastedActions, s.condition, s.success);
    }
    else if (verbose) {
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %-10s %-5s', s.step, action.name, s.durabilityState, s.cpState, s.qualityState, s.progressState, s.iqCnt, s.condition, s.success);
    }

    // Return final state
    return s;

}

function MonteCarloSequence(individual, startState, assumeSuccess, conditionalActionHandling, verbose, debug, logOutput) {
    verbose = verbose !== undefined ? verbose : true;
    debug = debug !== undefined ? debug : false;
    logOutput = logOutput !== undefined ? logOutput : null;

    if (conditionalActionHandling !== 'reposition' && conditionalActionHandling !== 'skipUnusable' && conditionalActionHandling !== 'ignoreUnusable') {
        throw new Error("invalid conditionalActionHandling value: " + conditionalActionHandling);
    }

    var logger = new Logger(logOutput);

    var s = startState;

    // Initialize counters
    var maxConditionUses = 0;

    // Check for null or empty individuals
    if (individual === null || individual.length === 0) {
        return startState;
    }
    // Strip Tricks of the Trade from individual
    if (conditionalActionHandling === 'reposition') {
        var onExcellentOnlyActions = [];
        var onGoodOnlyActions = [];
        var onGoodOrExcellentActions = [];
        var onPoorOnlyActions = [];
        var tempIndividual = [];
        for (var i = 0; i < individual.length; i++) {
            if (individual[i].onExcellent && !individual[i].onGood) {
                onExcellentOnlyActions.push(individual[i]);
                maxConditionUses += 1;
            }
            else if ((individual[i].onGood && !individual[i].onExcellent) && !individual[i].onPoor) {
                onGoodOnlyActions.push(individual[i]);
                maxConditionUses += 1;
            }
            else if (individual[i].onGood || individual[i].onExcellent) {
                onGoodOrExcellentActions.push(individual[i]);
                maxConditionUses += 1;
            }
            else if (individual[i].onPoor && !(individual[i].onExcellent || individual[i].onGood)) {
                onPoorOnlyActions.push(individual[i]);
                maxConditionUses += 1;
            }
            else {
                tempIndividual.push(individual[i]);
            }
        }
        individual = tempIndividual;
    }

    if (debug) {
        logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s %-5s %-5s %-5s %-5s %-5s %-10s %-5s', '#', 'Action', 'DUR', 'CP', 'QUA', 'PRG', 'IQ', 'CTL', 'QINC', 'BPRG', 'BQUA', 'WAC', 'Cond', 'S/F');
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %5.0f %5.0f %5.0f %5.0f %5.0f %-10s %5.0f', s.step, '', s.durabilityState, s.cpState, s.qualityState, s.progressState, 0, s.synth.crafter.control, 0, 0, 0, 0, 'Normal', '');
    }
    else if (verbose) {
        logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s %-10s %-5s', '#', 'Action', 'DUR', 'CP', 'QUA', 'PRG', 'IQ', 'Cond', 'S/F');
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %-10s %5.0f', s.step, '', s.durabilityState, s.cpState, s.qualityState, s.progressState, 0, 'Normal', 0);

    }

    var states = [];

    states.push(s);

    for (i = 0; i < individual.length; i++) {
        var actionsArray = [];

        if (individual[i].isCombo) {
            for (var comboNumber = 0; comboNumber < individual[i].comboActions.length; comboNumber++) {
                actionsArray.push(getComboAction(individual[i].comboActions[comboNumber]));
            }
        } else {
            actionsArray.push(individual[i]);
        }
        for (var j = 0; j < actionsArray.length; j++) {
            var action = actionsArray[j];

            // Determine if action is usable
            var usable = action.onExcellent && s.condition === 'Excellent' ||
                action.onGood && s.condition === 'Good' ||
                action.onPoor && s.condition === 'Poor' ||
                (!action.onExcellent && !action.onGood && !action.onPoor);

            if (conditionalActionHandling === 'reposition') {
                // Manually re-add condition dependent action when conditions are met
                if (s.condition === 'Excellent' && s.trickUses < maxConditionUses) {
                    if (onExcellentOnlyActions.length > 0) {
                        s = MonteCarloStep(s, onExcellentOnlyActions.shift(), assumeSuccess, verbose, debug, logOutput);
                        states.push(s);
                    }
                    else if (onGoodOrExcellentActions.length > 0) {
                        s = MonteCarloStep(s, onGoodOrExcellentActions.shift(), assumeSuccess, verbose, debug, logOutput);
                        states.push(s);
                    }
                }
                if (s.condition === 'Good' && s.trickUses < maxConditionUses) {
                    if (onGoodOnlyActions.length > 0) {
                        s = MonteCarloStep(s, onGoodOnlyActions.shift(), assumeSuccess, verbose, debug, logOutput);
                        states.push(s);
                    }
                    else if (onGoodOrExcellentActions.length > 0) {
                        s = MonteCarloStep(s, onGoodOrExcellentActions.shift(), assumeSuccess, verbose, debug, logOutput);
                        states.push(s);
                    }
                }
                if (s.condition === 'Poor' && s.trickUses < maxConditionUses) {
                    if (onPoorOnlyActions.length > 0) {
                        s = MonteCarloStep(s, onPoorOnlyActions.shift(), assumeSuccess, verbose, debug, logOutput);
                        states.push(s);
                    }
                }

                // Process the original action as another step
                s = MonteCarloStep(s, action, assumeSuccess, verbose, debug, logOutput);
                states.push(s);
            }
            else if (conditionalActionHandling === 'skipUnusable') {
                // If not usable, record a skipped action without progressing other status counters
                if (!usable) {
                    s = s.clone();
                    s.action = action.shortName;
                    s.wastedActions += 1;
                    states.push(s);
                }
                // Otherwise, process action as normal
                else {
                    s = MonteCarloStep(s, action, assumeSuccess, verbose, debug, logOutput);
                    states.push(s);
                }
            }
            else if (conditionalActionHandling === 'ignoreUnusable') {
                // If not usable, skip action effect, progress other status counters
                s = MonteCarloStep(s, action, assumeSuccess, verbose, debug, logOutput);
                states.push(s);
            }
        }
    }

    // Check for feasibility violations
    var chk = s.checkViolations();

    if (debug) {
        logger.log('Progress Check: %s, Durability Check: %s, CP Check: %s, Tricks Check: %s, Reliability Check: %s, Wasted Actions: %d', chk.progressOk, chk.durabilityOk, chk.cpOk, chk.trickOk, chk.reliabilityOk, s.wastedActions);
    }
    else if (verbose) {
        logger.log('Progress Check: %s, Durability Check: %s, CP Check: %s, Tricks Check: %s, Reliability Check: %s, Wasted Actions: %d', chk.progressOk, chk.durabilityOk, chk.cpOk, chk.trickOk, chk.reliabilityOk, s.wastedActions);
    }

    return states;
}

function MonteCarloSim(individual, synth, nRuns, assumeSuccess, conditionalActionHandling, verbose, debug, logOutput) {
    verbose = verbose !== undefined ? verbose : false;
    debug = debug !== undefined ? debug : false;
    logOutput = logOutput !== undefined ? logOutput : null;

    var logger = new Logger(logOutput);

    var startState = NewStateFromSynth(synth);

    var bestSequenceStates;
    var worseSequenceStates;
    var finalStateTracker = [];
    for (var i = 0; i < nRuns; i++) {
        var states = MonteCarloSequence(individual, startState, assumeSuccess, conditionalActionHandling, false, false, logOutput);
        var finalState = states[states.length - 1];

        if (!bestSequenceStates || finalState.qualityState > bestSequenceStates[bestSequenceStates.length - 1].qualityState) {
            bestSequenceStates = states;
        }

        if (!worseSequenceStates || finalState.qualityState < worseSequenceStates[worseSequenceStates.length - 1].qualityState) {
            worseSequenceStates = states;
        }

        finalStateTracker.push(finalState);

        if (verbose) {
            logger.log('%2d %-20s %5d %5d %8.1f %5.1f %5d', i, 'MonteCarlo', finalState.durabilityState, finalState.cpState, finalState.qualityState, finalState.progressState, finalState.wastedActions);
        }
    }

    var avgDurability = getAverageProperty(finalStateTracker, 'durabilityState', nRuns);
    var avgCp = getAverageProperty(finalStateTracker, 'cpState', nRuns);
    var avgQuality = getAverageProperty(finalStateTracker, 'qualityState', nRuns);
    var avgProgress = getAverageProperty(finalStateTracker, 'progressState', nRuns);
    var avgHqPercent = getAverageHqPercent(finalStateTracker);
    var avgStats = {
        durability: avgDurability,
        cp: avgCp,
        quality: avgQuality,
        progress: avgProgress,
        hqPercent: avgHqPercent
    };

    var successRate = getSuccessRate(finalStateTracker);

    logger.log('%-2s %20s %-5s %-5s %-8s %-5s %-5s', '', '', 'DUR', 'CP', 'QUA', 'PRG', 'HQ%');
    logger.log('%2s %-20s %5.0f %5.0f %8.1f %5.1f %5.1f', '##', 'Expected Value: ', avgDurability, avgCp, avgQuality, avgProgress, avgHqPercent);

    var mdnDurability = getMedianProperty(finalStateTracker, 'durabilityState', nRuns);
    var mdnCp = getMedianProperty(finalStateTracker, 'cpState', nRuns);
    var mdnQuality = getMedianProperty(finalStateTracker, 'qualityState', nRuns);
    var mdnProgress = getMedianProperty(finalStateTracker, 'progressState', nRuns);
    var mdnHqPercent = getMedianHqPercent(finalStateTracker);
    var mdnStats = {
        durability: mdnDurability,
        cp: mdnCp,
        quality: mdnQuality,
        progress: mdnProgress,
        hqPercent: mdnHqPercent
    };

    logger.log('%2s %-20s %5.0f %5.0f %8.1f %5.1f %5.1f', '##', 'Median Value: ', mdnDurability, mdnCp, mdnQuality, mdnProgress, mdnHqPercent);

    var minDurability = getMinProperty(finalStateTracker, 'durabilityState');
    var minCp = getMinProperty(finalStateTracker, 'cpState');
    var minQuality = getMinProperty(finalStateTracker, 'qualityState');
    var minProgress = getMinProperty(finalStateTracker, 'progressState');
    var minQualityPercent = Math.min(synth.recipe.maxQuality, minQuality) / synth.recipe.maxQuality * 100;
    var minHqPercent = hqPercentFromQuality(minQualityPercent);
    var minStats = {
        durability: minDurability,
        cp: minCp,
        quality: minQuality,
        progress: minProgress,
        hqPercent: minHqPercent
    };

    logger.log('%2s %-20s %5.0f %5.0f %8.1f %5.1f %5.1f', '##', 'Min Value: ', minDurability, minCp, minQuality, minProgress, minHqPercent);

    var maxDurability = getMaxProperty(finalStateTracker, 'durabilityState');
    var maxCp = getMaxProperty(finalStateTracker, 'cpState');
    var maxQuality = getMaxProperty(finalStateTracker, 'qualityState');
    var maxProgress = getMaxProperty(finalStateTracker, 'progressState');
    var maxQualityPercent = Math.max(synth.recipe.maxQuality, maxQuality) / synth.recipe.maxQuality * 100;
    var maxHqPercent = hqPercentFromQuality(maxQualityPercent);
    var maxStats = {
        durability: maxDurability,
        cp: maxCp,
        quality: maxQuality,
        progress: maxProgress,
        hqPercent: maxHqPercent
    };

    logger.log('%2s %-20s %5.0f %5.0f %8.1f %5.1f %5.1f', '##', 'Max Value: ', maxDurability, maxCp, maxQuality, maxProgress, maxHqPercent);

    logger.log('\n%2s %-20s %5.1f %%', '##', 'Success Rate: ', successRate);

    logger.log('');

    logger.log("Monte Carlo Random Example");
    logger.log("==========================");
    MonteCarloSequence(individual, startState, assumeSuccess, conditionalActionHandling, false, true, logOutput);

    logger.log('');

    logger.log("Monte Carlo Best Example");
    logger.log("==========================");
    logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s %-5s %-5s %-5s %-5s %-5s %-10s %-5s', '#', 'Action', 'DUR', 'CP', 'QUA', 'PRG', 'IQ', 'CTL', 'QINC', 'BPRG', 'BQUA', 'WAC', 'Cond', 'S/F');

    for (var i = 0; i < bestSequenceStates.length; i++) {
        var s = bestSequenceStates[i];
        var action = AllActions[s.action];
        var actionName = action ? action.name : '';
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %5.0f %5.0f %5.0f %5.0f %5.0f %-10s %5.0f', s.step, actionName, s.durabilityState, s.cpState, s.qualityState, s.progressState, s.iqCnt, s.control, s.qualityGain, s.bProgressGain, s.bQualityGain, s.wastedActions, s.condition, s.success);
    }

    logger.log('');

    logger.log("Monte Carlo Worst Example");
    logger.log("==========================");
    logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s %-5s %-5s %-5s %-5s %-5s %-10s %-5s', '#', 'Action', 'DUR', 'CP', 'QUA', 'PRG', 'IQ', 'CTL', 'QINC', 'BPRG', 'BQUA', 'WAC', 'Cond', 'S/F');

    for (var i = 0; i < worseSequenceStates.length; i++) {
        var s = worseSequenceStates[i];
        var action = AllActions[s.action];
        var actionName = action ? action.name : '';
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %5.0f %5.0f %5.0f %5.0f %5.0f %-10s %5.0f', s.step, actionName, s.durabilityState, s.cpState, s.qualityState, s.progressState, s.iqCnt, s.control, s.qualityGain, s.bProgressGain, s.bQualityGain, s.wastedActions, s.condition, s.success);
    }

    logger.log('');

    return {
        successPercent: successRate,
        average: avgStats,
        median: mdnStats,
        min: minStats,
        max: maxStats,
    }
}

function getAverageProperty(stateArray, propName, nRuns) {
    var sumProperty = 0;
    var nSuccesses = 0;
    for (var i = 0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            nSuccesses += 1;
            sumProperty += stateArray[i][propName];
        }
    }

    return sumProperty / nSuccesses;
}

function getMedianProperty(stateArray, propName, nRuns) {
    var listProperty = [];
    for (var i = 0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            listProperty.push(stateArray[i][propName]);
        }
    }

    listProperty.sort(function (a, b) { return a - b });
    var medianPropIdx = Math.ceil(listProperty.length / 2);

    return listProperty[medianPropIdx];
}

function getAverageHqPercent(stateArray) {
    // Because quality can exceed maxQuality, the average will be skewed high and we cannot use average quality as the input to the hqPercentFromQuality function
    var nHQ = 0;
    var nSuccesses = 0;
    for (var i = 0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            nSuccesses += 1;

            var qualityPercent = stateArray[i]['qualityState'] / stateArray[i].synth.recipe.maxQuality * 100;
            var hqProbability = hqPercentFromQuality(qualityPercent) / 100;
            var hqRand = Math.random();
            if (hqRand <= hqProbability) {
                nHQ += 1;
            }
        }
    }

    return nHQ / nSuccesses * 100;
}

function getMedianHqPercent(stateArray) {
    // Because quality can exceed maxQuality, the median will be skewed high and we cannot use median quality as the input to the hqPercentFromQuality function
    var hqPercents = [];
    for (var i = 0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            var qualityPercent = Math.min(stateArray[i].synth.recipe.maxQuality, stateArray[i]['qualityState']) / stateArray[i].synth.recipe.maxQuality * 100;
            var hqProbability = hqPercentFromQuality(qualityPercent);
            hqPercents.push(hqProbability);
        }
    }

    hqPercents.sort(function (a, b) { return a - b });
    var medianPropIdx = Math.ceil(hqPercents.length / 2);

    return hqPercents[medianPropIdx];
}

function getSuccessRate(stateArray) {
    var nSuccesses = 0;
    for (var i = 0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            nSuccesses += 1;
        }
    }

    return nSuccesses / stateArray.length * 100;
}

function getMinProperty(stateArray, propName) {
    var minProperty = null;
    for (var i = 0; i < stateArray.length; i++) {
        if (minProperty === null) {
            minProperty = stateArray[i][propName];
        }
        else {
            if (minProperty > stateArray[i][propName]) {
                minProperty = stateArray[i][propName];
            }
        }
    }
    return minProperty;
}

function getMaxProperty(stateArray, propName) {
    var maxProperty = null;
    for (var i = 0; i < stateArray.length; i++) {
        if (maxProperty === null) {
            maxProperty = stateArray[i][propName];
        }
        else {
            if (maxProperty < stateArray[i][propName]) {
                maxProperty = stateArray[i][propName];
            }
        }
    }
    return maxProperty;
}

function qualityFromHqPercent(hqPercent) {
    var x = hqPercent;
    return -5.6604E-6 * Math.pow(x, 4) + 0.0015369705 * Math.pow(x, 3) - 0.1426469573 * Math.pow(x, 2) + 5.6122722959 * x - 5.5950384565;
}

function hqPercentFromQuality(qualityPercent) {
    var hqPercent = 1;
    if (qualityPercent === 0) {
        hqPercent = 1;
    }
    else if (qualityPercent >= 100) {
        hqPercent = 100;
    }
    else {
        while (qualityFromHqPercent(hqPercent) < qualityPercent && hqPercent < 100) {
            hqPercent += 1;
        }
    }
    return hqPercent;
}

function evalSeq(individual, mySynth, penaltyWeight) {
    penaltyWeight = penaltyWeight !== undefined ? penaltyWeight : 10000;

    var startState = NewStateFromSynth(mySynth);
    var result = simSynth(individual, startState, false, false, false);
    var penalties = 0;
    var fitness = 0;
    var fitnessProg = 0;
    var safetyMarginFactor = 1 + mySynth.recipe.safetyMargin * 0.01;

    // Sum the constraint violations
    penalties += result.wastedActions / 20;

    // Check for feasibility violations
    var chk = result.checkViolations();

    if (!chk.durabilityOk) {
        penalties += Math.abs(result.durabilityState);
    }

    if (!chk.progressOk) {
        penalties = Infinity; // High penalty for infeasible sequences
    }

    if (!chk.cpOk) {
        penalties += Math.abs(result.cpState);
    }

    if (result.trickUses > mySynth.maxTrickUses) {
        penalties += Math.abs(result.trickUses - mySynth.maxTrickUses);
    }

    if (result.reliability < mySynth.reliabilityIndex) {
        penalties += Math.abs(mySynth.reliabilityIndex - result.reliability);
    }

    if (mySynth.maxLength > 0) {
        var maxActionsExceeded = result.step - mySynth.maxLength;
        if (maxActionsExceeded > 0) {
            penalties += 0.1 * maxActionsExceeded; // Penalize excess length
        }
    }

    if (mySynth.solverVars.solveForCompletion) {
        fitness += result.cpState * mySynth.solverVars.remainderCPFitnessValue;
        fitness += result.durabilityState * mySynth.solverVars.remainderDurFitnessValue;
    } else {
        fitness += Math.min(mySynth.recipe.maxQuality * safetyMarginFactor, result.qualityState);
    }

    // Check if 'trainedPerfection' is used and retrieve its durSaved value if it exists
    var trainedPerfectionAction = individual.find(action => action.shortName === 'trainedPerfection');
    if (trainedPerfectionAction) {
        var durSaved = trainedPerfectionAction.durSaved || 0; // Default to 0 if durSaved is not present

        // Encourage if 'trainedPerfection' is used when quality is below the maximum
        if (result.qualityState < mySynth.recipe.maxQuality) {
            fitness *= 4; // Reward for using 'trainedPerfection'
        }

        // Reward based off of durability saved
        fitness += durSaved * (fitness / 100);
    }

    // Reward for combo actions
    var comboActionsCount = individual.filter(action => action.isCombo).length;
    if (comboActionsCount > 0) {
        fitness += result.step * 10 * comboActionsCount; // Reward based on the number of combo actions
    }


    fitness -= penaltyWeight * penalties;

    // Encourage shorter sequences with maximum progress and quality
    if (chk.progressOk && result.qualityState >= mySynth.recipe.maxQuality * safetyMarginFactor) {
        fitness *= (1 + 4 / result.step); // Reward shorter sequences
    }

    fitnessProg += result.progressState;

    return [fitness, fitnessProg, result.cpState, individual.length];
}




evalSeq.weights = [1.0, 1.0, 1.0, -1.0];

function heuristicSequenceBuilder(synth) {
    var sequence = [];
    var subSeq1 = [];
    var subSeq2 = [];
    var subSeq3 = [];
    var aa = AllActions;

    var cp = synth.crafter.craftPoints;
    var dur = synth.recipe.durability;
    var progress = 0;

    // Build a list of actions by short name for easy lookups
    var actionsByName = {};
    synth.crafter.actions.forEach(action => {
        if (action) {
            actionsByName[action.shortName] = true;
        }
    });

    var hasAction = actionName => actionsByName[actionName];

    var tryAction = actionName =>
        hasAction(actionName) && cp >= aa[actionName].cpCost && dur - aa[actionName].durabilityCost >= 0;

    var useAction = actionName => {
        cp -= aa[actionName].cpCost;
        dur -= aa[actionName].durabilityCost;
    };

    var pushAction = (seq, actionName) => {
        seq.push(aa[actionName]);
        useAction(actionName);
    };

    var unshiftAction = (seq, actionName) => {
        seq.unshift(aa[actionName]);
        useAction(actionName);
    };

    var restoreDurability = () => {
        if (hasAction('immaculateMend')) {
            unshiftAction(subSeq2, 'immaculateMend');
            dur = synth.recipe.durability;
        } else if (hasAction('manipulation')) {
            unshiftAction(subSeq2, 'manipulation');
            dur += 30;
        } else if (hasAction('mastersMend')) {
            unshiftAction(subSeq2, 'mastersMend');
            dur += 30;
        }
    };


    var effCrafterLevel = LevelTable[synth.crafter.level] || synth.crafter.level;
    var effRecipeLevel = synth.recipe.level;

    // Determine the preferred progress action
    var preferredProgressActions = ['prudentSynthesis', 'carefulSynthesis2', 'carefulSynthesis', 'basicSynth2', 'basicSynth'];
    var preferredAction = 'basicSynth'; // Default to basicSynth if none are available

    // Find the first available action in preferredProgressActions
    for (var i = 0; i < preferredProgressActions.length; i++) {
        if (hasAction(preferredProgressActions[i])) {
            preferredAction = preferredProgressActions[i];
            break; // Stop looping once we find the first available action
        }
    }


    // Calculate progress gain
    var bProgressGain = synth.calculateBaseProgressIncrease(effCrafterLevel, synth.crafter.craftsmanship);
    var progressGain = Math.floor(bProgressGain * aa[preferredAction].progressIncreaseMultiplier);

    var nProgSteps = Math.ceil(synth.recipe.difficulty / progressGain);
    var steps = 0;

    // Final step first
    if (tryAction(preferredAction)) {
        pushAction(subSeq3, preferredAction);
        progress += progressGain;
        steps += 1;
    }

    // Build progress sequence
    while (progress < synth.recipe.difficulty && steps < nProgSteps) {
        if (tryAction(preferredAction) && dur >= 10) {
            unshiftAction(subSeq2, preferredAction);
            progress += progressGain;
            steps += 1;
        } else {
            restoreDurability();
            if (dur < 10) break;
        }
    }

    sequence = [...subSeq2, ...subSeq3];

    // Ensure sufficient durability for remaining steps
    if (dur <= 20) restoreDurability();

    subSeq1 = [];
    subSeq2 = [];
    subSeq3 = [];

    // Improve quality
    if (tryAction('reflect')) {
        pushAction(subSeq1, 'reflect');
    }

    var preferredQualityActions = ['refinedTouchCombo', 'prudentTouch', 'preciseTouch', 'basicTouch'];
    preferredAction = preferredQualityActions.find(action => hasAction(action)) || 'basicTouch';

    // Add at least one quality improving action
    if (tryAction(preferredAction)) {
        pushAction(subSeq2, preferredAction);
    }

    subSeq1 = [...subSeq1, ...subSeq2];

    // Add Byregot's Blessing and Great Strides at the end of the quality stage
    if (tryAction('byregotsBlessing')) {
        unshiftAction(sequence, 'byregotsBlessing');
    }
    if (tryAction('greatStrides')) {
        unshiftAction(sequence, 'greatStrides');
    }

    subSeq2 = [];

    // Ensure "trainedPerfection" is placed before actions that cost 20 durability or no durability, then actions that cost 10 durability or less if no 20 cost actions are available
    var trainedPerfectionUsed = false;

    // Function to check if an action costs 20 durability
    var costsTwentyDurability = actionName => aa[actionName].durabilityCost === 20;

    // Function to check if an action costs no durability
    var costsNoDurability = actionName => aa[actionName].durabilityCost === 0;

    // Use remaining durability and CP on quality/durability improving actions
    while (cp > 0 && dur > 0) {
        if (tryAction(preferredAction) && dur > 10) {
            if (trainedPerfectionUsed || costsNoDurability(preferredAction) || costsTwentyDurability(preferredAction)) {
                pushAction(subSeq2, preferredAction);
            } else if (tryAction('trainedPerfection')) {
                pushAction(subSeq2, 'trainedPerfection');
                trainedPerfectionUsed = true;
            } else {
                pushAction(subSeq2, preferredAction);
            }
        } else if (dur < 20) {
            restoreDurability();
            if (dur < 10) break;
        } else {
            break;
        }
    }

    return [...subSeq2, ...sequence, ...subSeq1];

}





// Helper Functions
//=================

function _typeof(x) {
    if (Array.isArray(x)) {
        return 'array';
    }
    else {
        return typeof x;
    }
}

function clone(x) {
    var seen = {};
    function _clone(x) {
        if (x === null) {
            return null;
        }
        for (var s in seen) {
            if (s === x) {
                return seen[s];
            }
        }
        switch (_typeof(x)) {
            case 'object':
                var newObject = Object.create(Object.getPrototypeOf(x));
                seen[x] = newObject;
                for (var p in x) {
                    newObject[p] = _clone(x[p]);
                }
                return newObject;
            case 'array':
                var newArray = [];
                seen[x] = newArray;
                for (var pp in x) {
                    newArray[pp] = _clone(x[pp]);
                }
                return newArray;
            case 'number':
                return x;
            case 'string':
                return x;
            case 'boolean':
                return x;
            default:
                return x;
        }
    }
    return _clone(x);
}

var LevelTable = {
    51: 120,
    52: 125,
    53: 130,
    54: 133,
    55: 136,
    56: 139,
    57: 142,
    58: 145,
    59: 148,
    60: 150,
    61: 260,
    62: 265,
    63: 270,
    64: 273,
    65: 276,
    66: 279,
    67: 282,
    68: 285,
    69: 288,
    70: 290,
    71: 390,
    72: 395,
    73: 400,
    74: 403,
    75: 406,
    76: 409,
    77: 412,
    78: 415,
    79: 418,
    80: 420,
    81: 517,
    82: 520,
    83: 525,
    84: 530,
    85: 535,
    86: 540,
    87: 545,
    88: 550,
    89: 555,
    90: 560,
    91: 650,
    92: 653,
    93: 656,
    94: 660,
    95: 665,
    96: 670,
    97: 675,
    98: 680,
    99: 685,
    100: 690,
};

var Ing1RecipeLevelTable = {
    40: 36,
    41: 36,
    42: 37,
    43: 38,
    44: 39,
    45: 40,
    46: 41,
    47: 42,
    48: 43,
    49: 44,
    50: 45,
    55: 50,     // 50_1star     *** unverified
    70: 51,     // 50_2star     *** unverified
    90: 58,     // 50_3star     *** unverified
    110: 59,    // 50_4star     *** unverified
    115: 100,   // 51 @ 169/339 difficulty
    120: 101,   // 51 @ 210/410 difficulty
    125: 102,   // 52
    130: 110,   // 53
    133: 111,   // 54
    136: 112,   // 55
    139: 126,   // 56
    142: 131,   // 57
    145: 134,   // 58
    148: 137,   // 59
    150: 140,   // 60
    160: 151,   // 60_1star
    180: 152,   // 60_2star
    210: 153,   // 60_3star
    220: 153,   // 60_3star
    250: 154,   // 60_4star
    255: 238,   // 61 @ 558/1116 difficulty
    260: 240,   // 61 @ 700/1400 difficulty
    265: 242,   // 62
    270: 250,   // 63
    273: 251,   // 64
    276: 252,   // 65
    279: 266,   // 66
    282: 271,   // 67
    285: 274,   // 68
    288: 277,   // 69
    290: 280,   // 70
    300: 291,   // 70_1star
    320: 292,   // 70_2star
    350: 293,   // 70_3star
    390: 365,   // 71
    395: 375,   // 72
    400: 385,   // 73 
    403: 393,   // 74 
    406: 396,   // 75 
    409: 399,   // 76 
    412: 402,   // 77 
    415: 405,   // 78 
    418: 408,   // 79 
    420: 411,   // 80
};

var ProgressPenaltyTable = {
    180: -0.02,
    210: -0.035,
    220: -0.035,
    250: -0.04,
    320: -0.02,
    350: -0.035,
};

var QualityPenaltyTable = {
    0: -0.02,
    90: -0.03,
    160: -0.05,
    180: -0.06,
    200: -0.07,
    245: -0.08,
    300: -0.09,
    310: -0.10,
    340: -0.11,
};

var SuggestedCraftsmanship = {
    1: 22,
    2: 22,
    3: 22,
    4: 22,
    5: 50,
    6: 50,
    7: 50,
    8: 59,
    9: 59,
    10: 59,
    11: 67,
    12: 67,
    13: 67,
    14: 67,
    15: 67,
    16: 78,
    17: 78,
    18: 78,
    19: 82,
    20: 94,
    21: 94,
    22: 94,
    23: 99,
    24: 99,
    25: 99,
    26: 99,
    27: 99,
    28: 106,
    29: 106,
    30: 106,
    31: 121,
    32: 121,
    33: 121,
    34: 129,
    35: 129,
    36: 129,
    37: 129,
    38: 129,
    39: 136,
    40: 136,
    41: 136,
    42: 150,
    43: 150,
    44: 150,
    45: 150,
    46: 150,
    47: 161,
    48: 161,
    49: 161,
    50: 176,
    51: 281,
    52: 291,
    53: 302,
    54: 314,
    55: 325,
    56: 325,
    57: 325,
    58: 325,
    59: 325,
    60: 325,
    61: 325,
    62: 325,
    63: 325,
    64: 325,
    65: 325,
    66: 325,
    67: 325,
    68: 325,
    69: 325,
    70: 325,
    71: 329,
    72: 332,
    73: 335,
    74: 339,
    75: 342,
    76: 345,
    77: 349,
    78: 352,
    79: 355,
    80: 358,
    81: 362,
    82: 365,
    83: 368,
    84: 372,
    85: 375,
    86: 378,
    87: 382,
    88: 385,
    89: 388,
    90: 391,
    91: 394,
    92: 397,
    93: 400,
    94: 403,
    95: 406,
    96: 409,
    97: 412,
    98: 415,
    99: 418,
    100: 421,
    101: 424,
    102: 427,
    103: 430,
    104: 433,
    105: 436,
    106: 439,
    107: 442,
    108: 445,
    109: 448,
    110: 451,
    111: 455,
    112: 458,
    113: 462,
    114: 465,
    115: 468,
    116: 472,
    117: 475,
    118: 479,
    119: 482,
    120: 485,
    121: 489,
    122: 492,
    123: 495,
    124: 499,
    125: 502,
    126: 506,
    127: 509,
    128: 512,
    129: 516,
    130: 519,
    131: 522,
    132: 526,
    133: 529,
    134: 533,
    135: 536,
    136: 539,
    137: 543,
    138: 546,
    139: 550,
    140: 553,
    141: 556,
    142: 560,
    143: 563,
    144: 566,
    145: 570,
    146: 573,
    147: 577,
    148: 580,
    149: 583,
    150: 587,
    151: 590,
    152: 593,
    153: 597,
    154: 600,
    155: 604,
    156: 607,
    157: 610,
    158: 614,
    159: 617,
    160: 620,
    161: 625,
    162: 630,
    163: 635,
    164: 640,
    165: 645,
    166: 650,
    167: 655,
    168: 660,
    169: 665,
    170: 669,
    171: 674,
    172: 679,
    173: 684,
    174: 689,
    175: 694,
    176: 699,
    177: 704,
    178: 709,
    179: 714,
    180: 718,
    181: 723,
    182: 727,
    183: 732,
    184: 736,
    185: 740,
    186: 745,
    187: 749,
    188: 754,
    189: 758,
    190: 762,
    191: 767,
    192: 771,
    193: 776,
    194: 780,
    195: 784,
    196: 789,
    197: 793,
    198: 798,
    199: 802,
    200: 806,
    201: 811,
    202: 815,
    203: 820,
    204: 824,
    205: 828,
    206: 833,
    207: 837,
    208: 842,
    209: 846,
    210: 850,
    211: 852,
    212: 854,
    213: 856,
    214: 858,
    215: 860,
    216: 862,
    217: 864,
    218: 866,
    219: 868,
    220: 870,
    221: 875,
    222: 879,
    223: 883,
    224: 887,
    225: 891,
    226: 895,
    227: 900,
    228: 904,
    229: 908,
    230: 912,
    231: 916,
    232: 920,
    233: 925,
    234: 929,
    235: 933,
    236: 937,
    237: 941,
    238: 945,
    239: 950,
    240: 954,
    241: 958,
    242: 962,
    243: 966,
    244: 970,
    245: 975,
    246: 979,
    247: 983,
    248: 987,
    249: 991,
    250: 995,
    251: 998,
    252: 1000,
    253: 1002,
    254: 1004,
    255: 1006,
    256: 1008,
    257: 1010,
    258: 1012,
    259: 1014,
    260: 1016,
    261: 1019,
    262: 1021,
    263: 1023,
    264: 1025,
    265: 1027,
    266: 1029,
    267: 1031,
    268: 1033,
    269: 1035,
    270: 1037,
    271: 1040,
    272: 1042,
    273: 1044,
    274: 1046,
    275: 1048,
    276: 1050,
    277: 1052,
    278: 1054,
    279: 1056,
    280: 1058,
    281: 1061,
    282: 1063,
    283: 1065,
    284: 1067,
    285: 1069,
    286: 1071,
    287: 1073,
    288: 1075,
    289: 1077,
    290: 1079,
    291: 1082,
    292: 1084,
    293: 1086,
    294: 1088,
    295: 1090,
    296: 1092,
    297: 1094,
    298: 1096,
    299: 1098,
    300: 1100,
    301: 1111,
    302: 1122,
    303: 1133,
    304: 1144,
    305: 1155,
    306: 1166,
    307: 1177,
    308: 1188,
    309: 1199,
    310: 1210,
    311: 1221,
    312: 1232,
    313: 1243,
    314: 1254,
    315: 1265,
    316: 1276,
    317: 1287,
    318: 1298,
    319: 1309,
    320: 1320,
    321: 1326,
    322: 1332,
    323: 1338,
    324: 1344,
    325: 1350,
    326: 1356,
    327: 1362,
    328: 1368,
    329: 1374,
    330: 1380,
    331: 1386,
    332: 1392,
    333: 1398,
    334: 1404,
    335: 1410,
    336: 1416,
    337: 1422,
    338: 1428,
    339: 1434,
    340: 1440,
    341: 1446,
    342: 1452,
    343: 1458,
    344: 1464,
    345: 1470,
    346: 1476,
    347: 1482,
    348: 1488,
    349: 1494,
    350: 1500,
    351: 1505,
    352: 1510,
    353: 1515,
    354: 1520,
    355: 1525,
    356: 1530,
    357: 1535,
    358: 1540,
    359: 1545,
    360: 1550,
    361: 1555,
    362: 1560,
    363: 1565,
    364: 1570,
    365: 1575,
    366: 1580,
    367: 1585,
    368: 1590,
    369: 1595,
    370: 1600,
    371: 1605,
    372: 1610,
    373: 1615,
    374: 1620,
    375: 1625,
    376: 1630,
    377: 1635,
    378: 1640,
    379: 1645,
    380: 1650,
    381: 1320,
    382: 1320,
    383: 1320,
    384: 1320,
    385: 1320,
    386: 1320,
    387: 1320,
    388: 1320,
    389: 1320,
    390: 1320,
    391: 1334,
    392: 1347,
    393: 1361,
    394: 1375,
    395: 1388,
    396: 1402,
    397: 1416,
    398: 1429,
    399: 1443,
    400: 1457,
    401: 1470,
    402: 1484,
    403: 1498,
    404: 1511,
    405: 1525,
    406: 1539,
    407: 1552,
    408: 1566,
    409: 1580,
    410: 1593,
    411: 1607,
    412: 1621,
    413: 1634,
    414: 1648,
    415: 1662,
    416: 1675,
    417: 1689,
    418: 1702,
    419: 1716,
    420: 1730,
    421: 1743,
    422: 1757,
    423: 1771,
    424: 1784,
    425: 1798,
    426: 1812,
    427: 1825,
    428: 1839,
    429: 1853,
    430: 1866,
    431: 1880,
    432: 1894,
    433: 1907,
    434: 1921,
    435: 1935,
    436: 1948,
    437: 1962,
    438: 1976,
    439: 1989,
    440: 2000,
    441: 2017,
    442: 2030,
    443: 2044,
    444: 2058,
    445: 2071,
    446: 2085,
    447: 2099,
    448: 2112,
    449: 2126,
    450: 2140,
    451: 2151,
    452: 2162,
    453: 2173,
    454: 2184,
    455: 2195,
    456: 2206,
    457: 2217,
    458: 2228,
    459: 2239,
    460: 2250,
    461: 2261,
    462: 2272,
    463: 2283,
    464: 2294,
    465: 2305,
    466: 2316,
    467: 2327,
    468: 2338,
    469: 2349,
    470: 2360,
    471: 2372,
    472: 2384,
    473: 2396,
    474: 2408,
    475: 2420,
    476: 2432,
    477: 2444,
    478: 2456,
    479: 2468,
    480: 2480,
    481: 2484,
    482: 2488,
    483: 2492,
    484: 2496,
    485: 2500,
    486: 2504,
    487: 2508,
    488: 2512,
    489: 2516,
    490: 2520,
    491: 2525,
    492: 2530,
    493: 2535,
    494: 2540,
    495: 2545,
    496: 2550,
    497: 2555,
    498: 2560,
    499: 2565,
    500: 2570,
    501: 2575,
    502: 2580,
    503: 2585,
    504: 2590,
    505: 2595,
    506: 2600,
    507: 2605,
    508: 2610,
    509: 2615,
    510: 2620,
    511: 2620,
    512: 2620,
    513: 2620,
    514: 2620,
    515: 2620,
    516: 2620,
    517: 2620,
    518: 2620,
    519: 2620,
    520: 2620
};


var LevelDifferenceFactors = {
    'craftsmanship': {
        '-30': 0.8,
        '-29': 0.82,
        '-28': 0.84,
        '-27': 0.86,
        '-26': 0.88,
        '-25': 0.90,
        '-24': 0.92,
        '-23': 0.94,
        '-22': 0.96,
        '-21': 0.98,
        '-20': 1,
        '-19': 1,
        '-18': 1,
        '-17': 1,
        '-16': 1,
        '-15': 1,
        '-14': 1,
        '-13': 1,
        '-12': 1,
        '-11': 1,
        '-10': 1,
        '-9': 1,
        '-8': 1,
        '-7': 1,
        '-6': 1,
        '-5': 1,
        '-4': 1,
        '-3': 1,
        '-2': 1,
        '-1': 1,
        0: 1,
        1: 1.05,
        2: 1.1,
        3: 1.15,
        4: 1.2,
        5: 1.25,
        6: 1.27,
        7: 1.29,
        8: 1.31,
        9: 1.33,
        10: 1.35,
        11: 1.37,
        12: 1.39,
        13: 1.41,
        14: 1.43,
        15: 1.45,
        16: 1.46,
        17: 1.47,
        18: 1.48,
        19: 1.49,
        20: 1.5
    },
    'control': {
        '-30': 0.6,
        '-29': 0.64,
        '-28': 0.68,
        '-27': 0.72,
        '-26': 0.76,
        '-25': 0.80,
        '-24': 0.84,
        '-23': 0.88,
        '-22': 0.92,
        '-21': 0.96,
        '-20': 1,
        '-19': 1,
        '-18': 1,
        '-17': 1,
        '-16': 1,
        '-15': 1,
        '-14': 1,
        '-13': 1,
        '-12': 1,
        '-11': 1,
        '-10': 1,
        '-9': 1,
        '-8': 1,
        '-7': 1,
        '-6': 1,
        '-5': 1,
        '-4': 1,
        '-3': 1,
        '-2': 1,
        '-1': 1,
        0: 1,
        1: 1,
        2: 1,
        3: 1,
        4: 1,
        5: 1,
        6: 1,
        7: 1,
        8: 1,
        9: 1,
        10: 1,
        11: 1,
        12: 1,
        13: 1,
        14: 1,
        15: 1,
        16: 1,
        17: 1,
        18: 1,
        19: 1,
        20: 1
    }
};

function getLevelDifferenceFactor(kind, levelDiff) {
    if (levelDiff < -30) levelDiff = -30;
    else if (levelDiff > 20) levelDiff = 20;

    var factors = LevelDifferenceFactors[kind];
    if (!factors) {
        throw "unrecognized level difference factor kind";
    }

    return factors[levelDiff];
}

// Test objects
//cls, level, craftsmanship, control, craftPoints, actions
/*
var myWeaverActions = [basicSynth];
var myWeaver = new Crafter('Weaver', 20, 119, 117, 243, false, myWeaverActions);
var initiatesSlops = new Recipe(20,74,70,0,1053);
var mySynth = new Synth(myWeaver, initiatesSlops, maxTrickUses=1, useConditions=true);
var actionSequence = [innerQuiet, steadyHand, wasteNot, basicSynth, hastyTouch, hastyTouch, hastyTouch, steadyHand, hastyTouch, tricksOfTheTrade, standardTouch, standardTouch, standardTouch, tricksOfTheTrade, rumination, mastersMend, hastyTouch, basicSynth, basicTouch, basicSynth];

simSynth(actionSequence, mySynth, false, true);
MonteCarloSynth(actionSequence, mySynth, false, true);
MonteCarloSim(actionSequence, mySynth, 500);
evalSeq(actionSequence, mySynth);
*/
