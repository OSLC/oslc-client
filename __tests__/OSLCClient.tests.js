import { OSLCClient } from "../OSLCClient";
import { oslc, oslc_cm } from "../namespaces";

var client;

// OSLCClient.tests.js
describe("OSLCClient tests", () => {
  beforeAll(() => {
    /* runs once before all tests */
    const userId = process.env.USER_ID || "admin";
    const password = process.env.PASSWORD || "admin";
    const baseURI =
      process.env.BASE_URI || "https://elmdemo.smartfacts.com:9443/ccm";
    client = new OSLCClient(baseURI, userId, password);
  });
  beforeEach(() => {
    /* runs before each test */
  });

  describe("Test use a service provider", () => {
    test("use an ELM project area", async () => {
        let projectArea = "JKE Banking CM";
      try {
        await client.use(projectArea, "CM");
        expect(client.sp.queryBase(oslc_cm("ChangeRquest"))).toBeDefined();
        expect(client.sp.creationFactory(oslc_cm("ChangeRequest"))).toBeDefined();
      } catch (error) {
        console.log(`Failed to use project area: ${error.message}`);
        expect(error).toBeUndefined();
      }
    }, 10000);
  });

  describe("Test CRUD on a Change Request", () => {
    // Test cases...
    test("Test get a Change Request", async () => {
      try {
        const changeRequest = await client.getResource(
          'https://elmdemo.smartfacts.com:9443/ccm/resource/itemName/com.ibm.team.workitem.WorkItem/257'
        );
        expect(changeRequest).toBeDefined();
        expect(changeRequest.getURI()).toBeDefined();
        expect(changeRequest.getTitle()).toBe("SWT Exception");
      } catch (error) {
        console.log(`Failed to get a Change Request: ${error.message}`);
        expect(error).toBeUndefined();
      }
    });
  });

  afterEach(() => {
    /* cleanup after each test */
  });
  afterAll(() => {
    /* final cleanup */
  });
});
