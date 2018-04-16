
/*
 * Copyright 2014 IBM Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* Defines some common namespaces, explicitly added to the global scope */

var rdflib = require('rdflib')

global.FOAF = rdflib.Namespace("http://xmlns.com/foaf/0.1/")
global.RDF = rdflib.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#")
global.RDFS = rdflib.Namespace("http://www.w3.org/2000/01/rdf-schema#")
global.OWL = rdflib.Namespace("http://www.w3.org/2002/07/owl#")
global.DC = rdflib.Namespace("http://purl.org/dc/elements/1.1/")
global.RSS = rdflib.Namespace("http://purl.org/rss/1.0/")
global.XSD = rdflib.Namespace("http://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dt-")
global.CONTACT = rdflib.Namespace("http://www.w3.org/2000/10/swap/pim/contact#")
global.OSLC = rdflib.Namespace("http://open-services.net/ns/core#")
global.OSLCCM = rdflib.Namespace('http://open-services.net/ns/cm#')
global.OSLCAM = rdflib.Namespace('http://open-services.net/ns/am#')
global.OSLCRM = rdflib.Namespace('http://open-services.net/ns/rm#')
global.OSLCQM = rdflib.Namespace('http://open-services.net/ns/qm#')
global.DCTERMS = rdflib.Namespace('http://purl.org/dc/terms/')
global.OSLCCM10 = rdflib.Namespace('http://open-services.net/xmlns/cm/1.0/')
global.OSLCRM10 = rdflib.Namespace('http://open-services.net/xmlns/rm/1.0/')
global.JD = rdflib.Namespace('http://jazz.net/xmlns/prod/jazz/discovery/1.0/')

