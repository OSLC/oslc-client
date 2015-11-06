
/** This is a generic OSLC resource. Properties for
 * a particular domain resource will be added dynamically
 * when it is read. This allows the OSLC module to be used
 * on any domain without change or extension.
 * @author Jim Amsden
 * @class
 * @parm {string} id - the id of this resource, usually its URI
 */
function OSLCResource(id) {
	this.id = id;
}

module.exports = OSLCResource;