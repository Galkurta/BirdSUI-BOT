const fs = require("fs");
const path = require("path");
const axios = require("axios");
const readline = require("readline");
const { DateTime } = require("luxon");
const logger = require("./config/logger");
const printBanner = require("./config/banner");

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
  }

  formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const mins = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  }

  async countdown(seconds) {
    for (let i = seconds; i >= 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`Wait ${this.formatTime(i)} to continue the loop`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  }

  async callAPI(telegramauth) {
    const url = "https://birdx-api2.birds.dog/user";
    const headers = {
      ...this.headers,
      Telegramauth: `tma ${telegramauth}`,
    };
    const payload = {
      name:
        JSON.parse(
          decodeURIComponent(telegramauth.split("user=")[1].split("&")[0])
        ).first_name +
        " " +
        JSON.parse(
          decodeURIComponent(telegramauth.split("user=")[1].split("&")[0])
        ).last_name,
      referId: 6944804952,
      username: JSON.parse(
        decodeURIComponent(telegramauth.split("user=")[1].split("&")[0])
      ).username,
    };

    try {
      const getResponse = await axios.get(url, { headers });
      if (getResponse.data && getResponse.data.balance !== undefined) {
        logger.info(`Login successful!`);
        logger.info(`Balance: ${getResponse.data.balance}`);
        return getResponse.data;
      } else {
        throw new Error("New account");
      }
    } catch (error) {
      logger.warn(`Login unsuccessful, Registering account`);

      try {
        const postResponse = await axios.post(url, payload, { headers });
        if (postResponse.data && postResponse.data.balance !== undefined) {
          logger.info(`Registration successful!`);
          logger.info(`Balance: ${postResponse.data.balance}`);
          return postResponse.data;
        } else {
          throw new Error("Unable to register account");
        }
      } catch (postError) {
        logger.error(`Error: ${postError.message}`);
      }
    }

    logger.error("Login failed. Switching account");
    return null;
  }

  async callWormMintAPI(telegramauth) {
    const statusUrl = "https://worm.birds.dog/worms/mint-status";
    const mintUrl = "https://worm.birds.dog/worms/mint";
    const headers = {
      ...this.headers,
      Authorization: `tma ${telegramauth}`,
    };

    try {
      const statusResponse = await axios.get(statusUrl, { headers });
      const statusData = statusResponse.data.data;

      if (statusData.status === "MINT_OPEN") {
        logger.info("Worm spotted, catching it");

        const mintResponse = await axios.post(mintUrl, {}, { headers });
        const mintData = mintResponse.data.data;
        logger.info(`Result: ${mintResponse.data.message}`);

        if (mintData && mintData.status === "WAITING") {
          const nextMintTime = DateTime.fromISO(mintData.nextMintTime);
          const formattedNextMintTime = nextMintTime.toLocaleString(
            DateTime.DATETIME_FULL
          );
          logger.info(`Next worm catch: ${formattedNextMintTime}`);
        }
      } else if (statusData.status === "WAITING") {
        const nextMintTime = DateTime.fromISO(statusData.nextMintTime);
        const formattedNextMintTime = nextMintTime.toLocaleString(
          DateTime.DATETIME_FULL
        );
        logger.warn(`No worms found, next catch: ${formattedNextMintTime}`);
      } else {
        logger.warn(`Status: ${statusData.status}`);
      }
    } catch (error) {
      logger.error(`Error: ${error.message}`);
    }
  }

  async playEggMinigame(telegramauth) {
    const headers = {
      ...this.headers,
      Telegramauth: `tma ${telegramauth}`,
    };

    try {
      const joinResponse = await axios.get(
        "https://birdx-api2.birds.dog/minigame/egg/join",
        { headers }
      );
      let { turn } = joinResponse.data;
      logger.info(`Starting egg cracking: ${turn} turns`);

      const turnResponse = await axios.get(
        "https://birdx-api2.birds.dog/minigame/egg/turn",
        { headers }
      );
      turn = turnResponse.data.turn;
      logger.info(`Current turn: ${turn}`);

      let totalReward = 0;

      while (turn > 0) {
        const playResponse = await axios.get(
          "https://birdx-api2.birds.dog/minigame/egg/play",
          { headers }
        );
        const { result } = playResponse.data;
        turn = playResponse.data.turn;
        totalReward += result;
        logger.info(`${turn} Egg left | Reward ${result}`);
      }

      const claimResponse = await axios.get(
        "https://birdx-api2.birds.dog/minigame/egg/claim",
        { headers }
      );
      if (claimResponse.data === true) {
        logger.info("Claim successful!");
        logger.info(`Total reward: ${totalReward}`);
      } else {
        logger.error("Claim failed");
      }
    } catch (error) {
      logger.error(`Egg minigame error: ${error.message}`);
    }
  }

  async upgrade(telegramauth, balance) {
    const headers = {
      ...this.headers,
      Telegramauth: `tma ${telegramauth}`,
    };

    try {
      const infoResponse = await axios.get(
        "https://birdx-api2.birds.dog/minigame/incubate/info",
        { headers }
      );
      let incubationInfo = infoResponse.data;
      logger.info(`Egg level: ${incubationInfo.level}`);

      const currentTime = Date.now();
      const upgradeCompletionTime =
        incubationInfo.upgradedAt + incubationInfo.duration * 60 * 60 * 1000;

      if (incubationInfo.status === "processing") {
        if (currentTime > upgradeCompletionTime) {
          const confirmResponse = await axios.post(
            "https://birdx-api2.birds.dog/minigame/incubate/confirm-upgraded",
            {},
            { headers }
          );
          if (confirmResponse.data === true) {
            logger.info("Upgrade completed");
            const updatedInfoResponse = await axios.get(
              "https://birdx-api2.birds.dog/minigame/incubate/info",
              { headers }
            );
            incubationInfo = updatedInfoResponse.data;
          } else {
            logger.error("Upgrade confirmation failed");
          }
        } else {
          const remainingTime = Math.ceil(
            (upgradeCompletionTime - currentTime) / (60 * 1000)
          );
          logger.info(
            `Upgrade in progress | Time remaining: ${remainingTime} minutes`
          );
          return;
        }
      }

      if (incubationInfo.status === "confirmed" && incubationInfo.nextLevel) {
        if (balance >= incubationInfo.nextLevel.birds) {
          await this.upgradeEgg(headers);
        } else {
          logger.warn(
            `Not enough birds to upgrade. Need ${incubationInfo.nextLevel.birds} birds`
          );
        }
      } else if (incubationInfo.status === "confirmed") {
        logger.info("Maximum level reached");
      }
    } catch (error) {
      if (
        error.response &&
        error.response.status === 400 &&
        error.response.data === "Start incubating your egg now"
      ) {
        logger.warn("Start incubating your egg now.");
        await this.upgradeEgg(headers);
      } else {
        logger.error(`Egg upgrade error: ${error.message}`);
      }
    }
  }

  async upgradeEgg(headers) {
    try {
      const upgradeResponse = await axios.get(
        "https://birdx-api2.birds.dog/minigame/incubate/upgrade",
        { headers }
      );
      const upgradeInfo = upgradeResponse.data;
      const upgradeCompletionTime =
        upgradeInfo.upgradedAt + upgradeInfo.duration * 60 * 60 * 1000;
      const completionDateTime = new Date(upgradeCompletionTime);
      logger.info(
        `Starting upgrade to level ${
          upgradeInfo.level
        }. Completion time: ${completionDateTime.toLocaleString()}`
      );
    } catch (error) {
      logger.error(`Error during egg upgrade: ${error.message}`);
    }
  }

  async performTasks(telegramauth) {
    const headers = {
      ...this.headers,
      Telegramauth: `tma ${telegramauth}`,
    };

    try {
      const projectResponse = await axios.get(
        "https://birdx-api2.birds.dog/project",
        { headers }
      );
      const allTasks = projectResponse.data.flatMap((project) => project.tasks);

      const userTasksResponse = await axios.get(
        "https://birdx-api2.birds.dog/user-join-task",
        { headers }
      );
      const completedTaskIds = userTasksResponse.data.map(
        (task) => task.taskId
      );

      const incompleteTasks = allTasks.filter(
        (task) => !completedTaskIds.includes(task._id)
      );

      for (const task of incompleteTasks) {
        try {
          const payload = {
            taskId: task._id,
            channelId: task.channelId || "",
            slug: task.slug || "none",
            point: task.point,
          };

          const joinTaskResponse = await axios.post(
            "https://birdx-api2.birds.dog/project/join-task",
            payload,
            { headers }
          );

          if (joinTaskResponse.data.msg === "Successfully") {
            logger.info(`Task ${task.title} completed | reward: ${task.point}`);
          } else {
            logger.error(`Task ${task.title} failed`);
          }
        } catch (error) {}

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (incompleteTasks.length === 0) {
        logger.info("All tasks completed");
      }
    } catch (error) {
      logger.error(`Error performing tasks: ${error.message}`);
    }
  }

  askQuestion(query) {
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

  async main() {
    const dataFile = path.join(__dirname, "data.txt");
    const data = fs
      .readFileSync(dataFile, "utf8")
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean);

    const upgradeQuestion = await this.askQuestion(
      "Do you want to upgrade? (y/n): "
    );
    const shouldUpgrade = upgradeQuestion.toLowerCase() === "y";

    const taskQuestion = await this.askQuestion(
      "Do you want to perform tasks? (y/n): "
    );
    const shouldPerformTasks = taskQuestion.toLowerCase() === "y";

    while (true) {
      for (let i = 0; i < data.length; i++) {
        const telegramauth = data[i];
        const userData = JSON.parse(
          decodeURIComponent(telegramauth.split("user=")[1].split("&")[0])
        );
        const userId = userData.id;
        const firstName = userData.first_name;

        logger.info(`Account ${i + 1} | ${firstName}`);

        const apiResult = await this.callAPI(telegramauth);
        if (apiResult) {
          const balance = apiResult.balance;
          await this.callWormMintAPI(telegramauth);
          await this.playEggMinigame(telegramauth);
          if (shouldUpgrade) {
            logger.info(`Starting egg check and upgrade...`);
            await this.upgrade(telegramauth, balance);
          }
          if (shouldPerformTasks) {
            logger.info(`Starting task execution...`);
            await this.performTasks(telegramauth);
          }
        } else {
          logger.error(
            `API call failed for account ${userId} | Skipping this account.`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      await this.countdown(1440 * 60);
    }
  }
}

printBanner();
const client = new BirdX();
client.main().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
