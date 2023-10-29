import { ethers } from "ethers";
import ContractABI from "./abis/ContractABI.json";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
const API_ENDPOINT = process.env.API_ENDPOINT || "";
const BACKEND_NAME = process.env.BACKEND_NAME || "ibmq_qasm_simulator";

const provider = new ethers.providers.WebSocketProvider(RPC_ENDPOINT);

const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const contract = new ethers.Contract(CONTRACT_ADDRESS, ContractABI, signer);

console.log(ethers.utils.toUtf8Bytes("23472398472"));

async function pushCircuit(circuitQasm: string): Promise<string> {
  try {
    const {
      data: { jobId },
    } = await axios.post(
      `${API_ENDPOINT}/circuit${
        BACKEND_NAME ? `?backend_name=${BACKEND_NAME}` : ""
      }`,
      {
        qasm: circuitQasm,
      }
    );

    return jobId;
  } catch (err) {
    console.log(err);
    return "";
  }
}

async function getCircuitOutput(
  jobId: string
): Promise<Record<string, number> | null> {
  const { data } = await axios.post(
    `${API_ENDPOINT}/result/${jobId}${
      BACKEND_NAME ? `?backend_name=${BACKEND_NAME}` : ""
    }`
  );

  return data;
}

async function listenForCircuit(jobId: string, circuitHash: string) {
  console.log("A");
  getCircuitOutput(jobId)
    .then(async (output) => {
      await contract.addData(circuitHash, 2, JSON.stringify(output));
    })
    .catch((err) => {
      console.log(err);
      listenForCircuit(jobId, circuitHash);
    });
}

async function listener() {
  const filter = contract.filters.CircuitAdded();
  contract.on(filter, async (circuitQASM, circuitHash, _event) => {
    // push the circuit to ibm job list and get a job id, push the job id to the smart contract
    const jobId = await pushCircuit(circuitQASM);
    await contract.addData(circuitHash, 1, jobId);

    // start a listener for the response from the server
    listenForCircuit(jobId, circuitHash);
  });

  const filter2 = contract.filters.ResultsCollected();
  contract.on(filter2, async (circuitHash, _event) => {
    // get all the results and average them
    const totalOracleAddresses = await contract.totalOracleAddresses();
    const responses = [];
    let max_l = 0;
    const data: Record<string, number> = {};

    for (let i = 0; i < totalOracleAddresses; i++) {
      const response = await contract.oracleResponses(circuitHash, 2, i);
      const res = JSON.parse(response);
      responses.push(res);
      for (const key in res) {
        if (
          Object.prototype.hasOwnProperty.call(res, key) &&
          key.length > max_l
        ) {
          max_l = key.length;
        }
      }
    }

    for (const res of responses) {
      for (let key in res) {
        if (
          Object.prototype.hasOwnProperty.call(res, key) &&
          key.length > max_l
        ) {
          res[key.padStart(max_l, "0")] = res[key];
          delete res[key];
          key = key.padStart(max_l, "0");
        }
        if (!Object.prototype.hasOwnProperty.call(data, key)) {
          data[key] = res[key];
        } else {
          data[key] += res[key];
        }
      }
    }

    // push the data as clubed data
    await contract.addData(circuitHash, 3, JSON.stringify(data));
  });
}

listener();
