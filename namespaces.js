
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

import  { Namespace, sym } from 'rdflib';

export const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
export const rdfs = Namespace('http://www.w3.org/2000/01/rdf-schema#')
export const dcterms = Namespace('http://purl.org/dc/terms/')
export const foaf = Namespace("http://xmlns.com/foaf/0.1/")
export const owl = Namespace("http://www.w3.org/2002/07/owl#")
export const oslc = Namespace('http://open-services.net/ns/core#')
export const oslc_rm = Namespace('http://open-services.net/ns/rm#')
export const oslc_cm = Namespace ('http://open-services.net/ns/cm#')
export const oslc_cm1 = Namespace('http://open-services.net/xmlns/cm/1.0/')
export const rtc_cm = Namespace('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/')
export const rtc_cm_ext = Namespace('http://jazz.net/xmlns/prod/jazz/rtc/ext/1.0/')
export const rtc_ext = Namespace('http://jazz.net/xmlns/prod/jazz/rtc/ext/1.0/')
export const rtc_cm_resolvedBy = sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.workitem.linktype.resolvesworkitem.resolvedBy')
export const rtc_cm_relatedArtifact = sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.workitem.linktype.relatedartifact.relatedArtifact')
export const oslc_qm = Namespace('http://open-services.net/ns/qm#')
export const rqm_qm = Namespace('http://jazz.net/ns/qm/rqm#')
export const rqm_process = Namespace('http://jazz.net/xmlns/prod/jazz/rqm/process/1.0/')
export const oslc_qm1 = Namespace("http://open-services.net/xmlns/qm/1.0/")
export const atom = Namespace('http://www.w3.org/2005/Atom')
export const xml = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
export const rss = Namespace("http://purl.org/rss/1.0/")
export const xsd = Namespace("http://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dt-")
export const contact = Namespace("http://www.w3.org/2000/10/swap/pim/contact#")
export const jd = Namespace('http://jazz.net/xmlns/prod/jazz/discovery/1.0/')

