/**
 * Unit tests for ServiceProvider creation-factory and dialog discovery.
 * Uses a real rdflib graph parsed from a genoslc-style ServiceProvider document.
 */
import $rdf from 'rdflib';
import ServiceProvider from '../ServiceProvider.js';

const SP_URI = 'https://server/service-providers/demo';

const SP_RDF_XML = `<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:oslc="http://open-services.net/ns/core#"
    xmlns:dcterms="http://purl.org/dc/terms/">
  <oslc:ServiceProvider rdf:about="${SP_URI}">
    <oslc:service>
      <oslc:Service>
        <oslc:domain rdf:resource="http://open-services.net/ns/am#"/>
        <oslc:creationFactory>
          <oslc:CreationFactory>
            <dcterms:title>Goal Creation Factory</dcterms:title>
            <oslc:resourceType rdf:resource="http://www.omg.org/spec/BMM#Goal"/>
            <oslc:resourceShape rdf:resource="https://server/domain/BMM-Shapes#GoalShape"/>
            <oslc:creation rdf:resource="https://server/components/demo-c0/artifacts"/>
          </oslc:CreationFactory>
        </oslc:creationFactory>
        <oslc:creationFactory>
          <oslc:CreationFactory>
            <dcterms:title>Objective Creation Factory</dcterms:title>
            <oslc:resourceType rdf:resource="http://www.omg.org/spec/BMM#Objective"/>
            <oslc:resourceShape rdf:resource="https://server/domain/BMM-Shapes#ObjectiveShape"/>
            <oslc:creation rdf:resource="https://server/components/demo-c0/artifacts"/>
          </oslc:CreationFactory>
        </oslc:creationFactory>
        <oslc:creationDialog>
          <oslc:Dialog>
            <dcterms:title>Create Goal</dcterms:title>
            <oslc:label>New Goal</oslc:label>
            <oslc:resourceType rdf:resource="http://www.omg.org/spec/BMM#Goal"/>
            <oslc:resourceShape rdf:resource="https://server/domain/BMM-Shapes#GoalShape"/>
            <oslc:hintWidth>600px</oslc:hintWidth>
            <oslc:hintHeight>400px</oslc:hintHeight>
            <oslc:dialog rdf:resource="https://server/service-providers/demo/owned-creation-dialog?oslcType=http%3A%2F%2Fwww.omg.org%2Fspec%2FBMM%23Goal"/>
          </oslc:Dialog>
        </oslc:creationDialog>
        <oslc:selectionDialog>
          <oslc:Dialog>
            <dcterms:title>Select Goal</dcterms:title>
            <oslc:label>Goals</oslc:label>
            <oslc:resourceType rdf:resource="http://www.omg.org/spec/BMM#Goal"/>
            <oslc:hintWidth>600px</oslc:hintWidth>
            <oslc:hintHeight>400px</oslc:hintHeight>
            <oslc:dialog rdf:resource="https://server/service-providers/demo/owned-selection-dialog?oslcType=http%3A%2F%2Fwww.omg.org%2Fspec%2FBMM%23Goal"/>
          </oslc:Dialog>
        </oslc:selectionDialog>
        <oslc:selectionDialog>
          <oslc:Dialog>
            <dcterms:title>Select Objective</dcterms:title>
            <oslc:label>Objectives</oslc:label>
            <oslc:resourceType rdf:resource="http://www.omg.org/spec/BMM#Objective"/>
            <oslc:hintWidth>600px</oslc:hintWidth>
            <oslc:hintHeight>400px</oslc:hintHeight>
            <oslc:dialog rdf:resource="https://server/service-providers/demo/owned-selection-dialog?oslcType=http%3A%2F%2Fwww.omg.org%2Fspec%2FBMM%23Objective"/>
          </oslc:Dialog>
        </oslc:selectionDialog>
      </oslc:Service>
    </oslc:service>
  </oslc:ServiceProvider>
</rdf:RDF>`;

function makeServiceProvider() {
	const graph = $rdf.graph();
	$rdf.parse(SP_RDF_XML, graph, SP_URI, 'application/rdf+xml');
	return new ServiceProvider(SP_URI, graph);
}

describe('getCreationFactories', () => {
	it('returns all factories with full descriptors when no filter is given', () => {
		const sp = makeServiceProvider();
		const factories = sp.getCreationFactories();
		expect(factories).toHaveLength(2);
		const goal = factories.find(f => f.resourceTypes.includes('http://www.omg.org/spec/BMM#Goal'));
		expect(goal).toEqual({
			url: 'https://server/components/demo-c0/artifacts',
			resourceTypes: ['http://www.omg.org/spec/BMM#Goal'],
			resourceShape: 'https://server/domain/BMM-Shapes#GoalShape',
			label: null,
			title: 'Goal Creation Factory',
			usages: []
		});
	});

	it('filters by full resourceType URI string', () => {
		const sp = makeServiceProvider();
		const factories = sp.getCreationFactories('http://www.omg.org/spec/BMM#Objective');
		expect(factories).toHaveLength(1);
		expect(factories[0].title).toBe('Objective Creation Factory');
	});

	it('filters by suffix match, like the existing getCreationFactory', () => {
		const sp = makeServiceProvider();
		const factories = sp.getCreationFactories('BMM#Goal');
		expect(factories).toHaveLength(1);
		expect(factories[0].title).toBe('Goal Creation Factory');
	});
});

describe('getCreationDialogs', () => {
	it('returns dialog descriptors with url, shape, label, title and hints', () => {
		const sp = makeServiceProvider();
		const dialogs = sp.getCreationDialogs();
		expect(dialogs).toHaveLength(1);
		expect(dialogs[0]).toEqual({
			url: 'https://server/service-providers/demo/owned-creation-dialog?oslcType=http%3A%2F%2Fwww.omg.org%2Fspec%2FBMM%23Goal',
			resourceTypes: ['http://www.omg.org/spec/BMM#Goal'],
			resourceShape: 'https://server/domain/BMM-Shapes#GoalShape',
			label: 'New Goal',
			title: 'Create Goal',
			hintWidth: '600px',
			hintHeight: '400px',
			usages: []
		});
	});
});

describe('getSelectionDialogs', () => {
	it('returns all selection dialogs unfiltered', () => {
		const sp = makeServiceProvider();
		expect(sp.getSelectionDialogs()).toHaveLength(2);
	});

	it('filters by resourceType, accepting an rdflib NamedNode', () => {
		const sp = makeServiceProvider();
		const dialogs = sp.getSelectionDialogs($rdf.sym('http://www.omg.org/spec/BMM#Objective'));
		expect(dialogs).toHaveLength(1);
		expect(dialogs[0].title).toBe('Select Objective');
		expect(dialogs[0].resourceShape).toBeNull();
	});

	it('returns [] when nothing matches', () => {
		const sp = makeServiceProvider();
		expect(sp.getSelectionDialogs('http://example.com/Nope')).toEqual([]);
	});

	it('surfaces oslc:usage values so consumers can identify special dialogs (e.g. add-link)', () => {
		const USAGE_RDF_XML = SP_RDF_XML.replace(
			'</oslc:Service>',
			`<oslc:selectionDialog>
        <oslc:Dialog>
          <dcterms:title>Add Link</dcterms:title>
          <oslc:usage rdf:resource="http://smartfacts.com/ns#addLink"/>
          <oslc:hintWidth>700px</oslc:hintWidth>
          <oslc:hintHeight>500px</oslc:hintHeight>
          <oslc:dialog rdf:resource="https://server/service-providers/demo/dialog?mode=add-link"/>
        </oslc:Dialog>
      </oslc:selectionDialog>
    </oslc:Service>`);
		const graph = $rdf.graph();
		$rdf.parse(USAGE_RDF_XML, graph, SP_URI, 'application/rdf+xml');
		const sp = new ServiceProvider(SP_URI, graph);
		const addLink = sp.getSelectionDialogs()
			.find(d => d.usages.includes('http://smartfacts.com/ns#addLink'));
		expect(addLink).toBeDefined();
		expect(addLink.url).toBe('https://server/service-providers/demo/dialog?mode=add-link');
		expect(addLink.hintWidth).toBe('700px');
	});
});
