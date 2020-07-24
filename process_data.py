#!/usr/bin/python3
'#!/usr/bin/python3 -OO' # @todo use this instead

'''
Mention something about APSP == all pairs shortest paths
'''

# @todo update doc string

###########
# Imports #
###########

import json
import scipy
import numpy as np
import pandas as pd
import networkx as nx
import operator
from typing import Tuple, List, Optional

from misc_utilities import *

# @todo verify that all the imports above are used 

###########
# Globals #
###########

NETFLIX_CSV_FILE_LOCATION = './data/netflix_titles.csv'

OUTPUT_JSON_FILE_LOCATION = './docs/processed_data.json'

K_CORE_VALUE_FOR_VISUALZIATION = 20

##################################################
# Application Specific Data Processing Utilities #
##################################################

def preprocess_netflix_df(netflix_df: pd.DataFrame) -> pd.DataFrame:
    '''Destructive.'''
    netflix_df.drop(netflix_df[netflix_df['type'] != 'Movie'].index, inplace = True) 
    netflix_df.drop(columns=['type'], inplace=True)
    netflix_df.dropna(inplace=True)
    return netflix_df

def _expand_dataframe_list_values_for_column(df: pd.DataFrame, column_name: Union[str, int]) -> pd.DataFrame:
    return df.apply(lambda x: pd.Series(x[column_name].split(', ')), axis=1) \
                  .stack() \
                  .reset_index(level=1, drop=True) \
                  .to_frame(column_name) \
                  .join(df.drop(columns=[column_name]))

def generate_actor_to_movie_edgelist(netflix_df: pd.DataFrame) -> pd.DataFrame:
    actor_to_movie_edgelist = _expand_dataframe_list_values_for_column(netflix_df, 'cast')
    columns_to_keep = ('cast', 'title')
    actor_to_movie_edgelist.drop(columns=[column for column in actor_to_movie_edgelist.columns if column not in columns_to_keep], inplace=True)
    movies_with_same_name_as_actors = set(actor_to_movie_edgelist.cast).intersection(actor_to_movie_edgelist.title)
    rename_movie_if_actor_name_collision = lambda title: title+' (movie)' if title in movies_with_same_name_as_actors else title
    actor_to_movie_edgelist.title = actor_to_movie_edgelist.title.map(rename_movie_if_actor_name_collision)
    return actor_to_movie_edgelist

def extract_largest_connected_component_graph(graph: nx.Graph) -> Tuple[nx.Graph, set]:
    largest_cc_nodes = max(nx.connected_components(graph), key=len)
    larges_cc_graph = graph.subgraph(largest_cc_nodes)
    return larges_cc_graph, largest_cc_nodes

########################
# SciPy APSP Utilities #
########################

class TensorMap():
    def __init__(self, tensor: np.ndarray, position_to_id_map: List, id_to_position_map: Optional[dict] = None):
        self.tensor = tensor
        self.position_to_id_map = position_to_id_map
        self.id_to_position_map = {identifier: position for position, identifier in enumerate(position_to_id_map)} if id_to_position_map is None else id_to_position_map

    def __getitem__(self, key):
        position = self.id_to_position_map[key]
        item = self.tensor[position]
        if isinstance(item, np.ndarray):
            item = TensorMap(item, self.position_to_id_map, self.id_to_position_map)
        return item

    def __iter__(self):
        yield from self.position_to_id_map
    
    def todict(self):
        result_dict = {}
        for key in self:
            value = self[key]
            if isinstance(value , TensorMap):
                value = value.todict()
            result_dict[key] = value
        return result_dict

def apsp_via_scipy(graph: nx.Graph) -> Tuple[TensorMap, float]:
    total_time_container = {}
    with timer(exitCallback=lambda time: operator.setitem(total_time_container,'total_time', time)):
        nodes = list(graph.nodes())
        adjacency_matrix = nx.convert_matrix.to_scipy_sparse_matrix(graph, nodelist=nodes)
        dist_matrix, predecessors = scipy.sparse.csgraph.dijkstra(adjacency_matrix, directed=False, return_predecessors=True, unweighted=True)
        dist_map = TensorMap(dist_matrix, nodes)
    total_time = total_time_container['total_time']
    return dist_map, total_time

###########################
# NetworkX APSP Utilities #
###########################

def apsp_via_nx(graph: nx.Graph) -> Tuple[dict, float]:
    total_time_container = {}
    with timer(exitCallback=lambda time: operator.setitem(total_time_container,'total_time', time)):
        dist_map = dict(nx.all_pairs_shortest_path_length(graph))
    total_time = total_time_container['total_time']
    return dist_map, total_time

#########################################
# Path Data for Visualization Utilities #
#########################################

def generate_path_data_for_visualization(actor_to_actor_graph: nx.Graph) -> dict:
    actor_to_actor_graph = nx.k_core(actor_to_actor_graph, K_CORE_VALUE_FOR_VISUALZIATION)
    path_data = dict(nx.all_pairs_shortest_path(actor_to_actor_graph))
    return path_data

##########
# Driver #
##########

def _sanity_check_apsp_results(scipy_dist_map: TensorMap, nx_dist_map: dict) -> None:
    for start_node in scipy_dist_map:
        for end_node in scipy_dist_map[start_node]:
            assert scipy_dist_map[start_node][end_node] == nx_dist_map[start_node][end_node]
    return

@debug_on_error
def process_data() -> None:
    netflix_df = pd.read_csv(NETFLIX_CSV_FILE_LOCATION)
    print('Preprocessing data.')
    netflix_df = preprocess_netflix_df(netflix_df)
    actor_to_movie_edgelist = generate_actor_to_movie_edgelist(netflix_df)
    actor_to_movie_graph = nx.from_pandas_edgelist(actor_to_movie_edgelist, 'cast', 'title')
    actor_to_movie_graph, largest_cc_nodes = extract_largest_connected_component_graph(actor_to_movie_graph)
    largest_cc_actors = largest_cc_nodes.intersection(actor_to_movie_edgelist.cast.unique())
    actor_to_actor_graph = nx.projected_graph(actor_to_movie_graph, largest_cc_actors)
    actor_to_actor_graph = nx.k_core(actor_to_actor_graph, 20) ; actor_to_actor_graph, largest_cc_actors = extract_largest_connected_component_graph(actor_to_actor_graph) # @todo remove this
    print(f'The actor-to-actor graph has {len(actor_to_actor_graph.nodes())} nodes.')
    assert len(set(actor_to_actor_graph.nodes()).intersection(actor_to_movie_edgelist.title)) == 0
    print('Running APSP via SciPy.')
    scipy_apsp_dist_map, scipy_apsp_time = apsp_via_scipy(actor_to_actor_graph)
    print(f'APSP via SciPy took {scipy_apsp_time} seconds.')
    print('Running APSP via NetworkX.')
    nx_apsp_dist_map, nx_apsp_time = apsp_via_nx(actor_to_actor_graph)
    print(f'APSP via NetworkX took {nx_apsp_time} seconds.')
    _sanity_check_apsp_results(scipy_apsp_dist_map, nx_apsp_dist_map)
    path_data = generate_path_data_for_visualization(actor_to_actor_graph)
    print('Saving results.')
    output_dict = {
        'scipy_apsp_dist_map': scipy_apsp_dist_map.todict(),
        'scipy_apsp_time': scipy_apsp_time,
        'nx_apsp_dist_map': nx_apsp_dist_map,
        'nx_apsp_time': nx_apsp_time,
        'path_data': path_data,
    }
    with open(OUTPUT_JSON_FILE_LOCATION, 'w') as file_handle:
        json.dump(output_dict, file_handle, indent=4)
    print('Done.')
    return

if __name__ == '__main__':
    process_data()
 
