const LEVELS = [
    "Out of Toon",
    "Smellraiser",
    "Gexcques Cousteau",
    "Frankensteinfield",
    "www.dotcom.com",
    "Mao Tse Tongue",
    "The Umpire Strikes Out",
    "Pangaea 90210",
    "Fine Tooning",
    "This Old Cave",
    "Honey I Shrunk The Gecko",
    "Pain in the Asteroids",
    "Samurai Night Fever",
    "No Weddings and a Funeral",
    "Aztec 2 Step",
    "Thursday the 12th",
    "In Drag Net",
    "The Spy Who Loved Himself",
    "Lizard in a China Shop",
    "Bugged Out",
    "Chips and Dips",
    "Gilligex Isle",
    "Mooshoo Pork",
    "Gexzilla vs. Mecharez",
    "Channel Z",
    "The Media Dimension",
    "Intro 1",
    "Logo 4",
    "Logo 3",
    "Logo 2",
    "Logo 1"
]

const LEVELS_START_OFFSET = 0x708E0;
const LEVEL_BASE_RAM_ADDRESS = u32(0x8024B000) // Shared between gex 2 and gex 3

function address_to_map_offset(address) {
    return address - LEVEL_BASE_RAM_ADDRESS;
}

class Gex2LevelViewer {
    constructor(rom) {
        this.ROM = rom; // Gex2ROM class
    }
    
    select_level_from_index(index) {
        this.select_level(LEVELS[index]);
    }
    
    select_level(level) {
        console.log('Level changed to: ' + level);
        
        var index = LEVELS.indexOf(level);
        this.name = LEVELS[index];
        var mainDataOffset = LEVELS_START_OFFSET + (index * 0x20);
        
        var compressedMapDataStart = this.ROM.get_u32(mainDataOffset);
        var compressedMapDataEnd = this.ROM.get_u32(mainDataOffset + 0x4);
        
        console.log(`Decompressing level data between ${compressedMapDataStart.toString('16')} and ${compressedMapDataEnd.toString('16')}.`);

        // Get uncompressed map data.
        this.MapData = pako.inflate(this.ROM.get_section(compressedMapDataStart, compressedMapDataEnd), {raw:true});

        console.log("Decompressed Level Data");
        
        var mainHeaderOffset = address_to_map_offset(bytes_to_uint(this.MapData, 0));
        
        var segment1StartOffset = address_to_map_offset(bytes_to_uint(this.MapData, mainHeaderOffset + 0x24));
        var segment2StartOffset = address_to_map_offset(bytes_to_uint(this.MapData, mainHeaderOffset + 0x38));
        var segment3StartOffset = address_to_map_offset(bytes_to_uint(this.MapData, mainHeaderOffset + 0x3C));
        
        this.materials = [];
        this.specialMaterialMap = {};

        this.__parse_vert_block(segment1StartOffset, segment2StartOffset, segment3StartOffset, this.name);
        console.log("Finished parsing verts")
        
        /* Names of all the objects that should be loaded. */
        this.objectNameList = [];
        var objectNameListOffset = address_to_map_offset(bytes_to_uint(this.MapData, 0x40));
        var numOfObjectNames = bytes_to_uint(this.MapData, objectNameListOffset);
        for(var i = 0; i < numOfObjectNames; i++) {
            var index = objectNameListOffset + 4 + (i * 8);
            var name = binArrayToString(this.MapData.subarray(index, index + 8));
            this.objectNameList.push(name);
        }

        console.log(`Loaded object names (${this.objectNameList.length}).`);
        
        /* All the objects within the level. (Object ID to use, position, rotation, etc.) */
        this.levelObjects = [];
        var numOfLevelObjects = bytes_to_uint(this.MapData, 0x7C);
        var levelObjectsStartOffset = address_to_map_offset(bytes_to_uint(this.MapData, 0x80));
        for(var i = 0; i < numOfLevelObjects; i++) {
            var offset = levelObjectsStartOffset + (i * 0x30);
            let id = bytes_to_int(this.MapData, offset);
            let name = "UNKNOWN";
            if (id < this.objectNameList.length) {
                name = this.objectNameList[id];
            }
            this.levelObjects.push(new Gex2LevelViewerObject(this.MapData, offset, name));
        }

        console.log(`Loaded object data (${this.levelObjects.length}).`);
    }

    __parse_vert_block(segment1Start, segment2Start, segment3Start, name) {
        const level_offsets = {
            "Out of Toon": 0xD05B0,
            "Smellraiser": 0xCFBB0,
            "Gexcques Cousteau": 0x103380,
            "Frankensteinfield": 0xD39E0,
            "www.dotcom.com": 0xCBCC8,
            "Mao Tse Tongue": 0xD2E58,
            "The Umpire Strikes Out": 0xBB580,
            "Pangaea 90210": 0xB8C98,
            "Fine Tooning": 0xB0648,
            "This Old Cave": 0xBD2D8,
            "Honey I Shrunk The Gecko": 0xDD030,
            "Pain in the Asteroids": 0x96F90,
            "Samurai Night Fever": 0xDF618,
            "No Weddings and a Funeral": 0xFD1E0,
            "Aztec 2 Step": 0x6EE78,
            "Thursday the 12th": 0x3C770,
            "In Drag Net": 0x62918,
            "The Spy Who Loved Himself": 0x58B20,
            "Lizard in a China Shop": 0x5BD68,
            "Bugged Out": 0x14C18,
            "Chips and Dips": 0x517C0,
            "Gilligex Isle": 0x1C170,
            "Mooshoo Pork": 0x153F8,
            "Gexzilla vs. Mecharez": 0x22F70,
            "Channel Z": 0x3BB08,
            "The Media Dimension": 0xDBD88,
            "Intro 1": -1,
            "Logo 4": -1,
            "Logo 3": -1,
            "Logo 2": -1,
            "Logo 1": -1
        };

        let offset = level_offsets[name];
        if (offset === undefined) return;

        while (true) {
            if (this.MapData[offset + 9] == 2) {
                if (bytes_to_uint(this.MapData, offset + 0x14) == 0xCDCDCDCD) {
                    offset += 0x18;
                    continue;
                }
                if (bytes_to_uint(this.MapData, offset + 0x14) == 0xFDFDFDFD) {
                    break;
                }

                let keepParsing = true;
                let currentMaterial = this.materials.length > 0 ? this.materials[0] : null;
                let indiciesOffset = 0;
                offset += 0x10;

                while (keepParsing) {
                    let numCmds = bytes_to_uint(this.MapData, offset) / 8;
                    offset += 8;
                    if (numCmds == 0 && this.MapData[offset] == 0x00) break;
                    for (let i = 0; i < numCmds; ++i) {
                        let cmd = this.MapData[offset];

                        let w1 = bytes_to_uint(this.MapData, offset);
                        let w2 = bytes_to_uint(this.MapData, offset + 4);

                        if (cmd == 0x04) {
                            let localOffset = ((w1 & 0xFF0000) >> 4) >> 1;
                            let indexStart = (w2 & 0xFFFFFF) >> 4;
                            indiciesOffset = indexStart + localOffset;
                        } else if (cmd == 0x06) {
                            let specialTexOffset = segment2Start + (w2 & 0x00FFFFFF);
                            let find = this.specialMaterialMap[specialTexOffset];
                            if (find === undefined) {
                                this.specialMaterialMap[specialTexOffset] = this.materials.length;
                                this.materials.push(new Gex2LevelViewerMaterial(this.MapData, specialTexOffset, segment3Start));
                                currentMaterial = this.materials[this.materials.length - 1];
                            } else {
                                currentMaterial = this.materials[find];
                            }
                        } else if (cmd == 0xB1) {
                            if (currentMaterial !== null) {
                                let localIndex1 = this.__check_if_material_has_vertex(this.MapData, currentMaterial, (((w1 & 0xFF0000) >> 16) >> 1) + indiciesOffset, segment1Start);
                                let localIndex2 = this.__check_if_material_has_vertex(this.MapData, currentMaterial, (((w1 & 0xFF00) >> 8) >> 1) + indiciesOffset, segment1Start);
                                let localIndex3 = this.__check_if_material_has_vertex(this.MapData, currentMaterial, ((w1 & 0xFF) >> 1) + indiciesOffset, segment1Start);
                                let localIndex4 = this.__check_if_material_has_vertex(this.MapData, currentMaterial, (((w2 & 0xFF0000) >> 16) >> 1) + indiciesOffset, segment1Start);
                                let localIndex5 = this.__check_if_material_has_vertex(this.MapData, currentMaterial, (((w2 & 0xFF00) >> 8) >> 1) + indiciesOffset, segment1Start);
                                let localIndex6 = this.__check_if_material_has_vertex(this.MapData, currentMaterial, ((w2 & 0xFF) >> 1) + indiciesOffset, segment1Start);
                                let face3 = new THREE.Face3(localIndex1, localIndex2, localIndex3);
                                face3.vertexColors[0] = currentMaterial.vertices[localIndex1].color;
                                face3.vertexColors[1] = currentMaterial.vertices[localIndex2].color;
                                face3.vertexColors[2] = currentMaterial.vertices[localIndex3].color;
                                face3.uvs = [
                                    currentMaterial.vertices[localIndex1].uv, 
                                    currentMaterial.vertices[localIndex2].uv, 
                                    currentMaterial.vertices[localIndex3].uv
                                ];
                                currentMaterial.triangles.push(face3);
                                let face3_2 = new THREE.Face3(localIndex4, localIndex5, localIndex6)
                                face3_2.vertexColors[0] = currentMaterial.vertices[localIndex4].color;
                                face3_2.vertexColors[1] = currentMaterial.vertices[localIndex5].color;
                                face3_2.vertexColors[2] = currentMaterial.vertices[localIndex6].color;
                                face3_2.uvs = [
                                    currentMaterial.vertices[localIndex4].uv, 
                                    currentMaterial.vertices[localIndex5].uv, 
                                    currentMaterial.vertices[localIndex6].uv
                                ];
                                currentMaterial.triangles.push(face3_2);
                            }
                        } else if (cmd == 0xBF) {
                            if (currentMaterial !== null) {
                                let localIndex1 = this.__check_if_material_has_vertex(this.MapData, currentMaterial, (((w2 & 0xFF0000) >> 16) >> 1) + indiciesOffset, segment1Start);
                                let localIndex2 = this.__check_if_material_has_vertex(this.MapData, currentMaterial, (((w2 & 0xFF00) >> 8) >> 1) + indiciesOffset, segment1Start);
                                let localIndex3 = this.__check_if_material_has_vertex(this.MapData, currentMaterial, ((w2 & 0xFF) >> 1) + indiciesOffset, segment1Start);
                                let face3 = new THREE.Face3(localIndex1, localIndex2, localIndex3);
                                face3.vertexColors[0] = currentMaterial.vertices[localIndex1].color;
                                face3.vertexColors[1] = currentMaterial.vertices[localIndex2].color;
                                face3.vertexColors[2] = currentMaterial.vertices[localIndex3].color;
                                face3.uvs = [
                                    currentMaterial.vertices[localIndex1].uv, 
                                    currentMaterial.vertices[localIndex2].uv, 
                                    currentMaterial.vertices[localIndex3].uv
                                ];
                                currentMaterial.triangles.push(face3);
                            }
                        } else if (cmd == 0xB8) {
                            if (bytes_to_uint(this.MapData, offset + 8) == 0) {
                                offset += 16;
                                keepParsing = false;
                                break;
                            }
                        }

                        offset += 8;
                    }
                }
            } else break;
        }
    }

    __check_if_material_has_vertex(data, material, vertexID, segment1Start) {
        
        let foundIndex = material.indexIDs.indexOf(vertexID);

        if (foundIndex === -1) {
            foundIndex = material.indexIDs.length;
            material.indexIDs.push(vertexID);
            material.vertices.push(new Gex2LevelViewerVertex(data, segment1Start + vertexID * 0x10, material));
        }

        return foundIndex;
    }
}

class Gex2LevelViewerObject {
    constructor(data, offset, name) {
        this.name = name;
        this.id = bytes_to_int(data, offset);
        this.pos = new THREE.Vector3(
            bytes_to_short(data, offset + 0x10),
            bytes_to_short(data, offset + 0x14),
            -bytes_to_short(data, offset + 0x12)
        ).multiplyScalar(WORLD_SCALE);
    }
    
    make_clone(original_mesh){
        var new_mesh = original_mesh.clone();
        new_mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
        return new_mesh;
    }
}

class Gex2LevelViewerVertex {
    constructor(data, offset, material) {
        var x = bytes_to_short(data, offset) * WORLD_SCALE;
        var y = bytes_to_short(data, offset + 2) * WORLD_SCALE;
        var z = bytes_to_short(data, offset + 4) * WORLD_SCALE;
        var u = bytes_to_short(data, offset + 8);
        var v = bytes_to_short(data, offset + 10);
        var r = data[offset + 0xC];
        var g = data[offset + 0xD];
        var b = data[offset + 0xE];
        
        this.color = new THREE.Color(r / 255, g / 255, b / 255);
        this.uv = new THREE.Vector2(u, v).divideScalar(2048.0);
        this.pos = new THREE.Vector3(x, z, -y); // Model is Z-Up, so make it Y-up instead.
        this.pos.color = this.color;
        this.pos.uv = this.uv.multiply(material.uvScale);
    }
}

class Gex2LevelViewerMaterial {
    constructor(data, addressOrOffset, segment3Start) {
        this.indexIDs = [];
        this.vertices = [];
        this.triangles = [];
        this.isAnimated = false;
        if((addressOrOffset & 0x80000000) != 0) { // Check if using RAM address.
            this.address = addressOrOffset;
            if (this.address > LEVEL_BASE_RAM_ADDRESS) {
                this.offset = address_to_map_offset(addressOrOffset);
                var dataType = bytes_to_ushort(data, this.offset);
                if(dataType == 0x0007){
                    this.isAnimated = true;
                    this.animFrames = [];
                    var numOfAnimatedFrames = bytes_to_ushort(data, this.offset + 2);
                    for(var i = 0; i < numOfAnimatedFrames; i++) {
                        var address = bytes_to_uint(data, this.offset + 4 + (i*4));
                        this.animFrames.push(new Gex2LevelViewerMaterial(data, address, segment3Start));
                    }
                    this.__parse(data, segment3Start);
                } else {
                    // Normal texture data.
                    this.__parse(data, segment3Start);
                }
                
            }
        } else { // Just an offset.
            this.offset = addressOrOffset
            this.address = LEVEL_BASE_RAM_ADDRESS + addressOrOffset;
            this.__parse(data, segment3Start);
        }
    }
    
    __parse(data, segment3Start) {
        var format = 0x10;
        var texWidth = 32;
        var texHeight = 32;
        var palette = [];
        var texOffset = 0;
        var offset = this.offset;
        var cmd = data[offset];
        while(cmd != 0xB8){
            switch(cmd){
                case 0xF0:
                    var numColors = ((bytes_to_ushort(data, offset + 5) >> 4) >> 2) + 1;
                    var bytes = data.subarray(texOffset, texOffset + (numColors*2));
                    palette = N64TextureDecoder.decode_rgba16(bytes, numColors, 1);
                    break;
                case 0xF2:
                    texWidth = ((bytes_to_ushort(data, offset + 5) >> 4) >> 2) + 1;
                    texHeight = ((bytes_to_ushort(data, offset + 6) & 0xFFF) >> 2) + 1;
                    break;
                case 0xF5:
                    if((data[offset + 1] != 0) && (data[offset + 2] != 0)) {
                        format = data[offset + 1];
                    }
                    break;
                case 0xFD:
                    format = data[offset + 1];
                    var seg3Offset = bytes_to_int(data, offset + 4) & 0x00FFFFFF;
                    texOffset = seg3Offset + segment3Start;
                    break;
                case 0xF3:
                case 0xE6:
                case 0xE7:
                case 0xBA:
                    break;
                default:
                    //if(cmd != undefined) console.error("Invalid F3DEX2 texture cmd: " + cmd.toString(16));
                    cmd = 0xB8;
                    continue; // break out of the while loop
            }
            // Get next cmd
            offset += 8;
            cmd = data[offset];
        }
        
        var numBytes = N64TextureDecoder.get_number_bytes_for_texture_data(format, texWidth, texHeight);
        var bytes = data.subarray(texOffset, texOffset + numBytes);
        
        this.format = format;
        this.width = texWidth;
        this.height = texHeight;
        
        this.uvScale = new THREE.Vector2(32.0 / texWidth, 32.0 / texHeight);
        
        this.palette = palette;
        this.rgbaData = N64TextureDecoder.decode_data(bytes, palette, format, texWidth, texHeight);
        this.hasTransparency = N64TextureDecoder.does_texture_have_transparency(this.rgbaData);
        this.tex = new THREE.DataTexture(this.rgbaData, texWidth, texHeight, THREE.RGBAFormat);
    }
}