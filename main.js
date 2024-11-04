const fs = require("fs");
const path = require("path");
const axios = require("axios");
const readline = require("readline");
const { DateTime } = require("luxon");
const logger = require("./config/logger");
const printBanner = require("./config/banner");

// API Client class to handle HTTP requests
class APIClient {
  constructor(headers) {
    this.headers = headers;
    this.baseUrl = "https://api.birds.dog";
    this.wormUrl = "https://worm.birds.dog";
  }

  async get(endpoint, auth = null) {
    const headers = auth ? { ...this.headers, ...auth } : this.headers;
    return axios.get(`${this.baseUrl}${endpoint}`, { headers });
  }

  async post(endpoint, data = {}, auth = null) {
    const headers = auth ? { ...this.headers, ...auth } : this.headers;
    return axios.post(`${this.baseUrl}${endpoint}`, data, { headers });
  }

  async getWorm(endpoint, auth = null) {
    const headers = auth ? { ...this.headers, ...auth } : this.headers;
    return axios.get(`${this.wormUrl}${endpoint}`, { headers });
  }

  async postWorm(endpoint, data = {}, auth = null) {
    const headers = auth ? { ...this.headers, ...auth } : this.headers;
    return axios.post(`${this.wormUrl}${endpoint}`, data, { headers });
  }
}

// User Management class
class UserManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  extractUserInfo(telegramauth) {
    const userData = JSON.parse(
      decodeURIComponent(telegramauth.split("user=")[1].split("&")[0])
    );
    return {
      name: `${userData.first_name} ${userData.last_name}`,
      username: userData.username,
      firstName: userData.first_name,
      id: userData.id,
    };
  }

  async login(telegramauth) {
    const auth = { Telegramauth: `tma ${telegramauth}` };
    try {
      const response = await this.apiClient.get("/user", auth);
      if (response.data?.balance !== undefined) {
        logger.info("Login successful!");
        logger.info(`Balance: ${response.data.balance}`);
        return response.data;
      }
      throw new Error("New account");
    } catch (error) {
      return this.register(telegramauth);
    }
  }

  async register(telegramauth) {
    const auth = { Telegramauth: `tma ${telegramauth}` };
    const userInfo = this.extractUserInfo(telegramauth);
    const payload = {
      name: `${userInfo.name}`,
      referId: 6944804952,
      username: userInfo.username,
    };

    try {
      logger.warn("Login unsuccessful, Registering account");
      const response = await this.apiClient.post("/user", payload, auth);
      if (response.data?.balance !== undefined) {
        logger.info("Registration successful!");
        logger.info(`Balance: ${response.data.balance}`);
        return response.data;
      }
      throw new Error("Unable to register account");
    } catch (error) {
      logger.error(`Error: ${error.message}`);
      return null;
    }
  }
}

// Guild Management class
class GuildManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.guildId = "6719f06c4a340fbb632a5075";
  }

  async checkMembership(telegramauth) {
    const auth = { Telegramauth: telegramauth };
    try {
      const response = await this.apiClient.get("/guild/me", auth);
      if (response.data?.guildMember) {
        logger.info(`Already a member of guild: ${response.data.guild.name}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Error checking guild membership: ${error.message}`);
      return false;
    }
  }

  async join(telegramauth) {
    if (await this.checkMembership(telegramauth)) {
      return true;
    }

    const auth = { Telegramauth: telegramauth };
    try {
      const response = await this.apiClient.get(
        `/guild/join/${this.guildId}`,
        auth
      );
      if (response.data === "OK") {
        logger.info("Successfully joined the guild");
        return true;
      }
      logger.warn("Unexpected response when joining guild");
      return false;
    } catch (error) {
      logger.error(`Error joining guild: ${error.message}`);
      return false;
    }
  }
}

// Worm Management class
class WormManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async catchWorm(telegramauth) {
    const auth = { Authorization: `tma ${telegramauth}` };
    try {
      const statusResponse = await this.apiClient.getWorm(
        "/worms/mint-status",
        auth
      );
      const statusData = statusResponse.data.data;

      if (statusData.status === "MINT_OPEN") {
        logger.info("Worm spotted, catching it");
        const mintResponse = await this.apiClient.postWorm(
          "/worms/mint",
          {},
          auth
        );
        const mintData = mintResponse.data.data;
        logger.info(`Result: ${mintResponse.data.message}`);

        if (mintData?.status === "WAITING") {
          this.logNextMintTime(mintData.nextMintTime);
        }
      } else if (statusData.status === "WAITING") {
        this.logNextMintTime(statusData.nextMintTime);
      } else {
        logger.warn(`Status: ${statusData.status}`);
      }
    } catch (error) {
      logger.error(`Error: ${error.message}`);
    }
  }

  logNextMintTime(nextMintTime) {
    const formattedTime = DateTime.fromISO(nextMintTime).toLocaleString(
      DateTime.DATETIME_FULL
    );
    logger.info(`Next worm catch: ${formattedTime}`);
  }
}

// Minigame Management class
class MinigameManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async playEggGame(telegramauth) {
    const auth = { Telegramauth: `tma ${telegramauth}` };
    try {
      const joinResponse = await this.apiClient.get("/minigame/egg/join", auth);
      let { turn } = joinResponse.data;
      logger.info(`Starting egg cracking: ${turn} turns`);

      const turnResponse = await this.apiClient.get("/minigame/egg/turn", auth);
      turn = turnResponse.data.turn;
      logger.info(`Current turn: ${turn}`);

      let totalReward = 0;
      while (turn > 0) {
        const playResponse = await this.apiClient.get(
          "/minigame/egg/play",
          auth
        );
        const { result } = playResponse.data;
        turn = playResponse.data.turn;
        totalReward += result;
        logger.info(`${turn} Egg left | Reward ${result}`);
      }

      await this.claimReward(auth, totalReward);
    } catch (error) {
      logger.error(`Egg minigame error: ${error.message}`);
    }
  }

  async claimReward(auth, totalReward) {
    try {
      const claimResponse = await this.apiClient.get(
        "/minigame/egg/claim",
        auth
      );
      if (claimResponse.data === true) {
        logger.info("Claim successful!");
        logger.info(`Total reward: ${totalReward}`);
      } else {
        logger.error("Claim failed");
      }
    } catch (error) {
      logger.error(`Claim error: ${error.message}`);
    }
  }

  async upgradeEgg(telegramauth, balance) {
    const auth = { Telegramauth: `tma ${telegramauth}` };
    try {
      const info = await this.getIncubationInfo(auth);
      if (!info) return;

      if (await this.handleProcessingUpgrade(info, auth)) return;
      await this.handleConfirmedStatus(info, balance, auth);
    } catch (error) {
      await this.handleUpgradeError(error, auth);
    }
  }

  async getIncubationInfo(auth) {
    try {
      const response = await this.apiClient.get(
        "/minigame/incubate/info",
        auth
      );
      const info = response.data;
      logger.info(`Egg level: ${info.level}`);
      return info;
    } catch (error) {
      logger.error(`Error getting incubation info: ${error.message}`);
      return null;
    }
  }

  async handleProcessingUpgrade(info, auth) {
    if (info.status !== "processing") return false;

    const currentTime = Date.now();
    const upgradeCompletionTime =
      info.upgradedAt + info.duration * 60 * 60 * 1000;

    if (currentTime > upgradeCompletionTime) {
      const confirmResponse = await this.apiClient.post(
        "/minigame/incubate/confirm-upgraded",
        {},
        auth
      );
      if (confirmResponse.data === true) {
        logger.info("Upgrade completed");
        return true;
      }
      logger.error("Upgrade confirmation failed");
    } else {
      const remainingTime = Math.ceil(
        (upgradeCompletionTime - currentTime) / (60 * 1000)
      );
      logger.info(
        `Upgrade in progress | Time remaining: ${remainingTime} minutes`
      );
    }
    return true;
  }

  async handleConfirmedStatus(info, balance, auth) {
    if (info.status !== "confirmed") return;

    if (!info.nextLevel) {
      logger.info("Maximum level reached");
      return;
    }

    if (balance >= info.nextLevel.birds) {
      await this.initiateUpgrade(auth);
    } else {
      logger.warn(
        `Not enough birds to upgrade. Need ${info.nextLevel.birds} birds`
      );
    }
  }

  async handleUpgradeError(error, auth) {
    if (
      error.response?.status === 400 &&
      error.response.data === "Start incubating your egg now"
    ) {
      logger.warn("Start incubating your egg now.");
      await this.initiateUpgrade(auth);
    } else {
      logger.error(`Egg upgrade error: ${error.message}`);
    }
  }

  async initiateUpgrade(auth) {
    try {
      const response = await this.apiClient.get(
        "/minigame/incubate/upgrade",
        auth
      );
      const upgradeInfo = response.data;
      const completionTime = new Date(
        upgradeInfo.upgradedAt + upgradeInfo.duration * 60 * 60 * 1000
      );
      logger.info(
        `Starting upgrade to level ${
          upgradeInfo.level
        }. Completion time: ${completionTime.toLocaleString()}`
      );
    } catch (error) {
      logger.error(`Error during egg upgrade: ${error.message}`);
    }
  }
}

// Task Management class
class TaskManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async performTasks(telegramauth) {
    const auth = { Telegramauth: `tma ${telegramauth}` };
    try {
      const incompleteTasks = await this.getIncompleteTasks(auth);
      if (incompleteTasks.length === 0) {
        logger.info("All tasks completed");
        return;
      }

      await this.executeTasks(incompleteTasks, auth);
    } catch (error) {
      logger.error(`Error performing tasks: ${error.message}`);
    }
  }

  async getIncompleteTasks(auth) {
    const [projectResponse, userTasksResponse] = await Promise.all([
      this.apiClient.get("/project", auth),
      this.apiClient.get("/user-join-task", auth),
    ]);

    const allTasks = projectResponse.data.flatMap((project) => project.tasks);
    const completedTaskIds = userTasksResponse.data.map((task) => task.taskId);

    return allTasks.filter((task) => !completedTaskIds.includes(task._id));
  }

  async executeTasks(tasks, auth) {
    for (const task of tasks) {
      try {
        const payload = {
          taskId: task._id,
          channelId: task.channelId || "",
          slug: task.slug || "none",
          point: task.point,
        };

        const response = await this.apiClient.post(
          "/project/join-task",
          payload,
          auth
        );
        if (response.data.msg === "Successfully") {
          logger.info(`Task ${task.title} completed | reward: ${task.point}`);
        } else {
          logger.error(`Task ${task.title} failed`);
        }
      } catch (error) {
        // Continue with next task if one fails
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// Utility class for common functions
class Utilities {
  static formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const mins = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  }

  static async countdown(seconds) {
    for (let i = seconds; i >= 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`Wait ${this.formatTime(i)} to continue the loop`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  }

  static askQuestion(query) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) =>
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans);
      })
    );
  }
}

// Main Application class
class BirdX {
  constructor() {
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US;q=0.6,en;q=0.5",
      "Content-Type": "application/json",
      Origin: "https://birdx.birds.dog",
      Referer: "https://birdx.birds.dog/",
      "Sec-Ch-Ua":
        '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };

    const apiClient = new APIClient(this.headers);
    this.userManager = new UserManager(apiClient);
    this.guildManager = new GuildManager(apiClient);
    this.wormManager = new WormManager(apiClient);
    this.minigameManager = new MinigameManager(apiClient);
    this.taskManager = new TaskManager(apiClient);
  }

  async loadAccounts() {
    const dataFile = path.join(__dirname, "data.txt");
    return fs
      .readFileSync(dataFile, "utf8")
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean);
  }

  async getUserPreferences() {
    const upgradeQuestion = await Utilities.askQuestion(
      "Do you want to upgrade? (y/n): "
    );
    const taskQuestion = await Utilities.askQuestion(
      "Do you want to perform tasks? (y/n): "
    );

    return {
      shouldUpgrade: upgradeQuestion.toLowerCase() === "y",
      shouldPerformTasks: taskQuestion.toLowerCase() === "y",
    };
  }

  async processAccount(telegramauth, preferences) {
    const userInfo = this.userManager.extractUserInfo(telegramauth);
    logger.info(`Processing account: ${userInfo.firstName}`);

    const apiResult = await this.userManager.login(telegramauth);
    if (!apiResult) {
      logger.error(
        `API call failed for account ${userInfo.id} | Skipping this account.`
      );
      return;
    }

    try {
      // Execute core activities
      await this.executeActivities(
        telegramauth,
        apiResult.balance,
        preferences
      );
    } catch (error) {
      logger.error(`Error processing account ${userInfo.id}: ${error.message}`);
    }

    // Wait before processing next account
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  async executeActivities(telegramauth, balance, preferences) {
    // Core activities
    await this.wormManager.catchWorm(telegramauth);
    await this.minigameManager.playEggGame(telegramauth);

    // Optional activities based on preferences
    if (preferences.shouldUpgrade) {
      logger.info("Starting egg check and upgrade...");
      await this.minigameManager.upgradeEgg(telegramauth, balance);
    }

    if (preferences.shouldPerformTasks) {
      logger.info("Starting task execution...");
      await this.taskManager.performTasks(telegramauth);
    }

    // Guild joining attempt
    logger.info("Attempting to join guild...");
    await this.guildManager.join(telegramauth);
  }

  async main() {
    try {
      // Load accounts and get user preferences
      const accounts = await this.loadAccounts();
      const preferences = await this.getUserPreferences();

      // Main loop
      while (true) {
        for (const telegramauth of accounts) {
          await this.processAccount(telegramauth, preferences);
        }

        // Wait before starting next cycle
        await Utilities.countdown(180);
      }
    } catch (error) {
      logger.error(`Fatal error in main loop: ${error.message}`);
      process.exit(1);
    }
  }
}

// Application initialization
printBanner();
const client = new BirdX();
client.main().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
