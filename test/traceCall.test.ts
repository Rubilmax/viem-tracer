import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { describe, vi } from "vitest";
import { test } from "./setup";

const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

describe("traceCall", () => {
  test("should trace call", async ({ expect, client }) => {
    const traces = await client.traceCall({
      to: usdc,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [client.account.address, parseUnits("100", 6)],
      }),
    });

    expect(traces).toMatchInlineSnapshot(`
      {
        "calls": [
          {
            "error": "execution reverted",
            "from": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            "gas": "0x1c22d8c",
            "gasUsed": "0x14f1",
            "input": "0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100",
            "output": "0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000",
            "revertReason": "ERC20: transfer amount exceeds balance",
            "to": "0x43506849d7c04f9138d1a2050bbf3a0c054402dd",
            "type": "DELEGATECALL",
            "value": "0x0",
          },
        ],
        "error": "execution reverted",
        "from": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        "gas": "0x1c96f24",
        "gasUsed": "0x85d9",
        "input": "0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100",
        "output": "0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000",
        "revertReason": "ERC20: transfer amount exceeds balance",
        "to": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "type": "CALL",
        "value": "0x0",
      }
    `);
  });

  test("should trace failing eth_estimateGas by default", async ({ expect, client }) => {
    await expect(
      client.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [client.account.address, parseUnits("100", 6)],
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: execution reverted: ERC20: transfer amount exceeds balance

      0 ↳ FROM 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
      0 ↳ CALL (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance
        1 ↳ DELEGATECALL (0x43506849d7c04f9138d1a2050bbf3a0c054402dd).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance

       
      Estimate Gas Arguments:
        from:                  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:                    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:                  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
        maxFeePerGas:          7.588479508 gwei
        maxPriorityFeePerGas:  1 gwei
        nonce:                 783
       
      Request Arguments:
        from:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
       
      Contract Call:
        address:   0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        function:  transfer(address recipient, uint256 amount)
        args:              (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 100000000)
        sender:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

      Docs: https://viem.sh/docs/contract/writeContract
      Version: viem@2.29.0]
    `);
  });

  test("should trace failing eth_sendTransaction by default", async ({ expect, client }) => {
    await expect(
      client.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: usdc,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [client.account.address, parseUnits("100", 6)],
            }),
          },
        ],
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ExecutionRevertedError: ERC20: transfer from the zero address

      0 ↳ FROM 0x0000000000000000000000000000000000000000
      0 ↳ CALL (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer from the zero address
        1 ↳ DELEGATECALL (0x43506849d7c04f9138d1a2050bbf3a0c054402dd).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer from the zero address


      Version: viem@2.29.0]
    `);
  });

  test("should not trace failing txs when disabled", async ({ expect, client }) => {
    client.transport.tracer.failed = false;

    await expect(
      client.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [client.account.address, parseUnits("100", 6)],
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: The contract function "transfer" reverted with the following reason:
      ERC20: transfer amount exceeds balance

      Contract Call:
        address:   0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        function:  transfer(address recipient, uint256 amount)
        args:              (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 100000000)
        sender:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

      Docs: https://viem.sh/docs/contract/writeContract
      Version: viem@2.29.0]
    `);

    client.transport.tracer.failed = true;

    await expect(
      client.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [client.account.address, parseUnits("100", 6)],
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: execution reverted: ERC20: transfer amount exceeds balance

      0 ↳ FROM 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
      0 ↳ CALL (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance
        1 ↳ DELEGATECALL (0x43506849d7c04f9138d1a2050bbf3a0c054402dd).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance

       
      Estimate Gas Arguments:
        from:                  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:                    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:                  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
        maxFeePerGas:          7.588479508 gwei
        maxPriorityFeePerGas:  1 gwei
        nonce:                 783
       
      Request Arguments:
        from:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
       
      Contract Call:
        address:   0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        function:  transfer(address recipient, uint256 amount)
        args:              (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 100000000)
        sender:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

      Docs: https://viem.sh/docs/contract/writeContract
      Version: viem@2.29.0]
    `);
  });

  test("should trace next tx with gas even when failed disabled", async ({ expect, client }) => {
    const amount = parseUnits("100", 6);
    const consoleSpy = vi.spyOn(console, "log");

    client.transport.tracer.failed = false;
    client.transport.tracer.next = true;
    client.transport.tracer.gas = true;

    await client.deal({ erc20: usdc, amount });
    await client
      .writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [client.account.address, amount / 2n],
      })
      .catch(() => {});

    expect(consoleSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "0 ↳ FROM 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
      0 ↳ CALL (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48).transfer[ 37,560 / 29,978,392 ](0xf39Fd6e5…2266, 50000000) -> true
        1 ↳ DELEGATECALL (0x43506849d7c04f9138d1a2050bbf3a0c054402dd).transfer[ 11,463 / 29,502,848 ](0xf39Fd6e5…2266, 50000000) -> true
          2 ↳ LOG Transfer(0xf39Fd6e5…2266, 0xf39Fd6e5…2266, 50000000)
      ",
        ],
      ]
    `);

    consoleSpy.mockRestore();
  });

  test("should not trace next tx when next disabled", async ({ expect, client }) => {
    client.transport.tracer.next = false;

    await expect(
      client.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [client.account.address, parseUnits("100", 6)],
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: The contract function "transfer" reverted with the following reason:
      ERC20: transfer amount exceeds balance

      Contract Call:
        address:   0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        function:  transfer(address recipient, uint256 amount)
        args:              (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 100000000)
        sender:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

      Docs: https://viem.sh/docs/contract/writeContract
      Version: viem@2.29.0]
    `);

    await expect(
      client.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [client.account.address, parseUnits("100", 6)],
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: execution reverted: ERC20: transfer amount exceeds balance

      0 ↳ FROM 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
      0 ↳ CALL (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance
        1 ↳ DELEGATECALL (0x43506849d7c04f9138d1a2050bbf3a0c054402dd).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance

       
      Estimate Gas Arguments:
        from:                  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:                    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:                  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
        maxFeePerGas:          7.588479508 gwei
        maxPriorityFeePerGas:  1 gwei
        nonce:                 783
       
      Request Arguments:
        from:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
       
      Contract Call:
        address:   0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        function:  transfer(address recipient, uint256 amount)
        args:              (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 100000000)
        sender:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

      Docs: https://viem.sh/docs/contract/writeContract
      Version: viem@2.29.0]
    `);
  });

  test("should trace raw steps when enabled", async ({ expect, client }) => {
    client.transport.tracer.raw = true;

    await expect(
      client.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [client.account.address, parseUnits("100", 6)],
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: execution reverted: ERC20: transfer amount exceeds balance

      0 ↳ FROM 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
      0 ↳ CALL (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance
      {"from":"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266","gas":"0x1c96f24","gasUsed":"0x85d9","to":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","input":"0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100","output":"0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000","error":"execution reverted","revertReason":"ERC20: transfer amount exceeds balance","calls":[{"from":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","gas":"0x1c22d8c","gasUsed":"0x14f1","to":"0x43506849d7c04f9138d1a2050bbf3a0c054402dd","input":"0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100","output":"0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000","error":"execution reverted","revertReason":"ERC20: transfer amount exceeds balance","value":"0x0","type":"DELEGATECALL"}],"value":"0x0","type":"CALL"}
        1 ↳ DELEGATECALL (0x43506849d7c04f9138d1a2050bbf3a0c054402dd).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance
      {"from":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","gas":"0x1c22d8c","gasUsed":"0x14f1","to":"0x43506849d7c04f9138d1a2050bbf3a0c054402dd","input":"0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100","output":"0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000","error":"execution reverted","revertReason":"ERC20: transfer amount exceeds balance","value":"0x0","type":"DELEGATECALL"}

       
      Estimate Gas Arguments:
        from:                  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:                    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:                  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
        maxFeePerGas:          7.588479508 gwei
        maxPriorityFeePerGas:  1 gwei
        nonce:                 783
       
      Request Arguments:
        from:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
       
      Contract Call:
        address:   0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        function:  transfer(address recipient, uint256 amount)
        args:              (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 100000000)
        sender:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

      Docs: https://viem.sh/docs/contract/writeContract
      Version: viem@2.29.0]
    `);

    await expect(
      client.writeContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [client.account.address, parseUnits("100", 6)],
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: execution reverted: ERC20: transfer amount exceeds balance

      0 ↳ FROM 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
      0 ↳ CALL (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance
      {"from":"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266","gas":"0x1c96f24","gasUsed":"0x85d9","to":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","input":"0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100","output":"0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000","error":"execution reverted","revertReason":"ERC20: transfer amount exceeds balance","calls":[{"from":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","gas":"0x1c22d8c","gasUsed":"0x14f1","to":"0x43506849d7c04f9138d1a2050bbf3a0c054402dd","input":"0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100","output":"0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000","error":"execution reverted","revertReason":"ERC20: transfer amount exceeds balance","value":"0x0","type":"DELEGATECALL"}],"value":"0x0","type":"CALL"}
        1 ↳ DELEGATECALL (0x43506849d7c04f9138d1a2050bbf3a0c054402dd).transfer(0xf39Fd6e5…2266, 100000000) -> ERC20: transfer amount exceeds balance
      {"from":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","gas":"0x1c22d8c","gasUsed":"0x14f1","to":"0x43506849d7c04f9138d1a2050bbf3a0c054402dd","input":"0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100","output":"0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000","error":"execution reverted","revertReason":"ERC20: transfer amount exceeds balance","value":"0x0","type":"DELEGATECALL"}

       
      Estimate Gas Arguments:
        from:                  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:                    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:                  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
        maxFeePerGas:          7.588479508 gwei
        maxPriorityFeePerGas:  1 gwei
        nonce:                 783
       
      Request Arguments:
        from:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        to:    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        data:  0xa9059cbb000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb922660000000000000000000000000000000000000000000000000000000005f5e100
       
      Contract Call:
        address:   0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
        function:  transfer(address recipient, uint256 amount)
        args:              (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 100000000)
        sender:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

      Docs: https://viem.sh/docs/contract/writeContract
      Version: viem@2.29.0]
    `);
  });
});
