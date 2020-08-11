
const isNumber = obj => typeof(obj)==='number';
const sum = inputArray => inputArray.reduce((a, b) => a + b, 0);
const mean = inputArray => sum(inputArray) / inputArray.length;
const sigmoid = x => 1/(1+Math.pow(Math.E, -x));
const randomChoice = choices => choices[Math.floor(Math.random() * choices.length)];

let updatePath;

const runVisualization = (dataLocationBaseName) => {
    
    const plotContainer = document.getElementById('svg-container');
    const svg = d3.select('#graph-svg');

    const alphaDecay = 0.01; // 0.0001;
    const velocityDecay = 0.9; // 0.5;
    const paddingBetweenNodes = 25;
    const linkForceAlpha = 0.005;
    const boundingBoxForceForceAlpha = 0.5;
    const simulation = d3.forceSimulation()
	  .alphaDecay(alphaDecay)
	  .velocityDecay(velocityDecay);

    var tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);

    const startNodeDropdown = document.getElementById('start-node-dropdown');
    const endNodeDropdown = document.getElementById('end-node-dropdown');
    
    const render = ({pathLookup, linkLookup, linkData, nodeData, actorNameToNode, actorNameToNeighborActorNames, actorNameToKevinBaconDistance}) => {

        svg.selectAll('*').remove();
        svg
	    .attr('width', `${plotContainer.clientWidth}px`)
	    .attr('height', `${plotContainer.clientHeight}px`);
        
	const svgWidth = parseFloat(svg.attr('width'));
	const svgHeight = parseFloat(svg.attr('height'));

        const edgeGroup = svg.append('g').attr('id', 'edge-group');
        const edgeEnterSelection = edgeGroup
	      .selectAll('line')
	      .data(linkData)
	      .enter()
              .append('line')
              .attr('class', link => link.className);
        
        const nodeGroup = svg.append('g').attr('id', 'node-group');
	const nodeEnterSelection = nodeGroup
	      .selectAll('circle')
	      .data(nodeData)
	      .enter()
              .append('circle')
              .attr('class', node => node.className)
              .on('mouseover', datum => {
                  tooltip
                      .style('opacity', .9)
                      .html(`${datum.id}<br>Radius: ${actorNameToKevinBaconDistance[datum.id]}`)
                      .style('left', (d3.event.pageX + 5) + 'px')
                      .style('top', (d3.event.pageY + 5) + 'px');
              })
              .on('mouseout', datum => {
                  tooltip.style('opacity', 0);
              });

        const linkForce = (alpha) => {
            return () => {
	        nodeData.forEach(node => {
                    const neighborNames = actorNameToNeighborActorNames[node.id];
                    const neighbors = [...neighborNames].map(name => actorNameToNode[name]);
                    const neighborMeanX = mean(neighbors.map(neighbor => neighbor.x));
                    const neighborMeanY = mean(neighbors.map(neighbor => neighbor.y));
                    const distanceToNeighborMean = Math.sqrt((node.x-neighborMeanX)**2 + (node.y-neighborMeanY)**2);
                    node.x = node.x * (1-alpha) + alpha * neighborMeanX;
                    node.y = node.y * (1-alpha) + alpha * neighborMeanY;
                });
            };
        };
        
        const drag = d3.drag();
        drag.on('drag', (d,i) => {
            d.x += d3.event.dx;
            d.y += d3.event.dy;
            simulation
                .alpha(0.5)
                .restart();
        });
        
	simulation
            .force('center', d3.forceCenter(svgWidth / 2, svgHeight / 2))
            .force('collide', d3.forceCollide(paddingBetweenNodes).strength(0.25).iterations(200))
            .force('links', linkForce(linkForceAlpha))
	    .nodes(nodeData).on('tick', () => {
		nodeEnterSelection
		    .attr('cx', datum => datum.x)
		    .attr('cy', datum => datum.y)
                    .call(drag);
		edgeEnterSelection
		    .attr('x1', datum => actorNameToNode[datum.source].x)
		    .attr('y1', datum => actorNameToNode[datum.source].y)
		    .attr('x2', datum => actorNameToNode[datum.target].x)
		    .attr('y2', datum => actorNameToNode[datum.target].y);
	    })
	    .restart();

        let selectedLinks = [];
        updatePath = () => {
            const startActorName = startNodeDropdown.value;
            const endActorName = endNodeDropdown.value;
            const path = pathLookup[startActorName][endActorName];
            selectedLinks.forEach(link => {
                link.className = 'unselected-link';
                const {source, target} = link;
                actorNameToNode[source].className = 'unselected-node';
                actorNameToNode[target].className = 'unselected-node';
            });
            selectedLinks = [];
            for (let i=0; i < path.length-1; i++) {
                const linkStartActorName = path[i];
                const linkEndActorName = path[i+1];
                const link = linkLookup[linkStartActorName][linkEndActorName];
                selectedLinks.push(link);
                link.className = 'selected-link';
                actorNameToNode[linkStartActorName].className = 'selected-node';
                actorNameToNode[linkEndActorName].className = 'selected-node';
            }
            actorNameToNode[endActorName].className = 'selected-end-node';
            actorNameToNode[startActorName].className = 'selected-start-node';
            nodeGroup
	        .selectAll('circle')
                .attr('class', node => node.className);
            edgeGroup
	        .selectAll('line')
                .attr('class', link => link.className);
            const pathDispllayTextDiv = document.getElementById('path-display-text');
            pathDispllayTextDiv.querySelectorAll('*').forEach(element => element.remove());
            path.forEach((actorName, index) => {
                const actorParagraphElement = document.createElement('p');
                if (index === 0) {
                    actorParagraphElement.setAttribute('class', 'path-display-text-start-node');
                } else if (index === path.length-1) {
                    actorParagraphElement.setAttribute('class', 'path-display-text-end-node');
                } else {
                    actorParagraphElement.setAttribute('class', 'path-display-text-node');
                }
                actorParagraphElement.innerHTML = actorName;
                pathDispllayTextDiv.append(actorParagraphElement);
                if (index!==path.length-1) {
                    const downArrowParagraphElement = document.createElement('p');
                    downArrowParagraphElement.innerHTML = '&darr;';
                    downArrowParagraphElement.setAttribute('class', 'path-display-text-down-arrow');
                    pathDispllayTextDiv.append(downArrowParagraphElement);
                }
            });
        };
        updatePath();
    };

    const dataLocation = `./processed_data.json`;
    d3.json(dataLocation)
	.then(data => {
            const {scipyAPSPTime, nxAPSPTime, minKevinBaconDistance, actorNameToKevinBaconDistance, kCoreValueForVisualziation, graphData, pathLookup} = data;
            document.getElementById('visualization-title').innerHTML = `Netflix 2019 Actor Collaboration ${kCoreValueForVisualziation}-Core Visualization`;
            document.getElementById('scipy-apsp-time').innerHTML = `SciPy All Pairs Shortest Paths Wall Time: ${scipyAPSPTime.toFixed(2)} seconds`;
            document.getElementById('nx-apsp-time').innerHTML = `NetworkX All Pairs Shortest Paths Wall Time: ${nxAPSPTime.toFixed(2)} seconds`;
            document.getElementById('min-kevin-bacon-distance').innerHTML = `Smallest Actor Radius: ${minKevinBaconDistance}`;
            const nodeData = graphData.nodes;
            const actorNameToNode = nodeData.reduce((accumulator, node) => {
		accumulator[node.id] = node;
                return accumulator;
            }, {});
            const linkData = graphData.links;
            const actorNameToNeighborActorNames = nodeData.reduce((accumulator, node) => {
		accumulator[node.id] = new Set();
                return accumulator;
            }, {});
            const linkLookup = {};
            nodeData.forEach(datum => {
                linkLookup[datum.id] = {};
                datum.className = 'unselected-node';
            });
            linkData.forEach(link => {
                const {source, target} = link;
	    	actorNameToNeighborActorNames[source].add(target);
	    	actorNameToNeighborActorNames[target].add(source);
                linkLookup[source][target] = link;
                linkLookup[target][source] = link;
                link.className = 'unselected-link';
            }, {});
            const sortedActorNames = nodeData.map(datum => datum.id).sort();
            sortedActorNames.forEach(actorName => {
                const startOptionElement = document.createElement('option');
                startOptionElement.setAttribute('value', actorName);
                startOptionElement.innerHTML = actorName;
                const endOptionElement = document.createElement('option');
                endOptionElement.setAttribute('value', actorName);
                endOptionElement.innerHTML = actorName;
                startNodeDropdown.append(startOptionElement);
                endNodeDropdown.append(endOptionElement);
            });
            startNodeDropdown.value = randomChoice(sortedActorNames);
            endNodeDropdown.value = startNodeDropdown.value;
            while (endNodeDropdown.value == startNodeDropdown.value) {
                endNodeDropdown.value = randomChoice(sortedActorNames);
            }
            const redraw = () => {
                render({pathLookup, linkLookup, linkData, nodeData, actorNameToNode, actorNameToNeighborActorNames, actorNameToKevinBaconDistance});
            };
	    redraw();
            window.addEventListener('resize', redraw);
	}).catch(err => {
	    console.error(err.message);
	    return;
	});
};
