import { ethers } from "ethers";
import ContractABI from "./abis/ContractABI.json";
import dotenv from "dotenv";

dotenv.config();

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

const provider = new ethers.providers.WebSocketProvider(RPC_ENDPOINT);

const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const contract = new ethers.Contract(CONTRACT_ADDRESS, ContractABI, signer);

console.log(ethers.utils.toUtf8Bytes("23472398472"));

async function pushCircuit(circuitQasm: string): Promise<string> {
  // TODO: use the api here

  return "123123123124123";
}

async function getCircuitOutput(
  jobId: string
): Promise<Record<string, number> | null> {
  // TODO: use the api here

  return {
    "00": 10,
    "01": 16,
    "10": 78,
    "11": 100,
  };
}

async function listener() {
  const filter = contract.filters.CircuitAdded();
  contract.on(filter, async (circuitQASM, circuitHash, event) => {
    // push the circuit to ibm job list and get a job id, push the job id to the smart contract
    const jobId = await pushCircuit(circuitQASM);
    await contract.addData(circuitHash, 1, jobId);

    // start a listener for the response from the server
    const interval = setInterval(async () => {
      // check if response is ready and if yes send the response back to the smart contract
      const output = await getCircuitOutput(jobId);

      if (output) {
        await contract.addData(circuitHash, 2, JSON.stringify(output));
        clearInterval(interval);
      }
    }, 2000);
  });

  const filter2 = contract.filters.ResultsCollected();
  contract.on(filter2, async (circuitHash, event) => {
    console.log(circuitHash);
    // get all the results and average them
    const totalOracleAddresses = await contract.totalOracleAddresses();
    let data;
    for (let i = 0; i < totalOracleAddresses; i++) {
      const response = await contract.oracleResponses(circuitHash, 2, i);
      const res = JSON.parse(ethers.utils.toUtf8String(response));
      console.log(res);
      if (!data) {
        data = res;
        continue;
      }

      for (const i in data) {
        if (
          Object.prototype.hasOwnProperty.call(data, i) &&
          Object.prototype.hasOwnProperty.call(res, i)
        ) {
          data[i] += res[i];
        }
      }
    }

    console.log(data);

    for (const i in data) {
      if (Object.prototype.hasOwnProperty.call(data, i)) {
        data[i] = Math.floor(data[i] / Number(totalOracleAddresses));
      }
    }

    console.log(data);

    // push the data as clubed data
    await contract.addData(
      circuitHash,
      3,
      ethers.utils.toUtf8Bytes(JSON.stringify(data))
    );

    // console.log(ethers.utils.parseBytes32String(event));
  });
}

listener();
