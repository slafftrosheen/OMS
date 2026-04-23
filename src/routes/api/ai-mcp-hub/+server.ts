import { json } from '@sveltejs/kit';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function GET() {
    let transport: StdioClientTransport | null = null;

    try {
        // 2. Configure a StdioClientTransport that spawns the supabase mcp server
        transport = new StdioClientTransport({
            command: 'npx',
            args: ['-y', '@supabase/mcp-server-supabase@latest'],
            // 3. Pass Node 101 Tailscale IP into the env configuration of the transport
            env: {
                ...process.env,
                SUPABASE_URL: 'http://100.98.202.69:54321',
            }
        });

        // 1. Initialize client
        const client = new Client({
            name: 'oms-orchestrator-mcp-client',
            version: '1.0.0',
        }, {
            capabilities: {}
        });

        // Connect to the MCP server
        await client.connect(transport);

        // 4. Return a JSON response listing the available tools
        const toolsResult = await client.listTools();

        return json({
            success: true,
            tools: toolsResult.tools
        });
    } catch (error) {
        console.error('MCP Hub Error:', error);
        return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    } finally {
        // Clean up child process
        if (transport) {
            try {
                await transport.close();
            } catch (closeError) {
                console.error('Error closing MCP transport:', closeError);
            }
        }
    }
}
